/**
 * The bot process (and Kubernetes Deployment): runs the scheduled tasks in bot/tasks.ts once a
 * minute. Safe to run more than one replica: every run is claimed in Postgres first.
 */
import pino from 'pino';
import { isLanguage } from '@isgratis/types';
import { blueskyChannel, logChannel, mastodonChannel, type BlueskyAccount, type Channel, type MastodonAccount } from './bot/publishers.js';
import { tick } from './bot/scheduler.js';
import { buildTasks } from './bot/tasks.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createCacheInvalidator } from './lib/cache.js';
import { checkLink, fetchPageText } from './lib/link-check.js';
import { createMailer } from './lib/mailer.js';
import { sendQueuedMail } from './services/mailing.js';

const config = loadConfig();
const logger = pino({ level: config.logLevel, name: 'bot' });
const { db, pool } = createDatabase(config.databaseUrl, 2);
const cache = createCacheInvalidator(config.cacheBanTarget, logger);

function parseAccounts<T extends { lang: string }>(name: string, raw: string): T[] {
  try {
    const value = JSON.parse(raw) as T[];
    if (!Array.isArray(value)) throw new Error('not a list');
    return value.filter((account) => {
      if (isLanguage(account.lang)) return true;
      logger.warn({ name, lang: account.lang }, 'skipping an account with an unknown language');
      return false;
    });
  } catch (error) {
    logger.error({ name, error: (error as Error).message }, 'could not read the accounts');
    return [];
  }
}

const channels: Channel[] = [
  ...parseAccounts<MastodonAccount>('BOT_MASTODON', config.bot.mastodon).map((account) => mastodonChannel(account)),
  ...parseAccounts<BlueskyAccount>('BOT_BLUESKY', config.bot.bluesky).map((account) => blueskyChannel(account)),
  ...config.bot.dryRunLanguages.filter(isLanguage).map((lang) => logChannel(lang, logger)),
];
const tasks = buildTasks({
  channels,
  dailyTime: config.bot.dailyTime,
  origin: config.publicOrigin,
  cache,
  mail: { weekday: config.mail.weeklyDay, time: config.mail.weeklyTime },
  billing: config.billing,
  drafts: { ...config.bot.drafts, globalPerHour: config.drafts.globalPerHour, ipHashSalt: config.ipHashSalt },
  ...(config.editor.enabled
    ? {
        editor: {
          deps: { llm: config.editor, check: (url: string) => checkLink(url, config.sourceChecks.timeoutMs) },
          offers: { llm: config.editor, fetchText: (url: string) => fetchPageText(url, config.sourceChecks.timeoutMs) },
          perRun: config.editor.perRun,
        },
      }
    : {}),
});

const mailer = createMailer(config.mail, logger);

let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (config.migrateOnStart) await runMigrations(config.databaseUrl);
  logger.info({ tasks: tasks.map((t) => t.name), channels: channels.map((c) => c.id), mail: mailer.dryRun ? 'log only' : 'smtp' }, 'bot started');
  while (!stopping) {
    try {
      await tick({ db, now: new Date(), logger }, tasks);
    } catch (error) {
      logger.error({ err: error }, 'bot tick failed');
    }
    // Mail is not a scheduled task but a queue: confirmation mails should not wait for a slot.
    try {
      const { sent, failed } = await sendQueuedMail(db, mailer, config.mail.perMinute);
      if (sent || failed) logger.info({ sent, failed, dryRun: mailer.dryRun }, 'mail sent');
    } catch (error) {
      logger.error({ err: error }, 'sending mail failed');
    }
    for (let i = 0; i < 60 && !stopping; i++) await sleep(1000);
  }
  await pool.end();
  logger.info('bot stopped');
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => (stopping = true));

main().catch((error: unknown) => {
  logger.error({ err: error }, 'bot crashed');
  process.exit(1);
});
