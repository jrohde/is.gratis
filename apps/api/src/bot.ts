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
const tasks = buildTasks({ channels, dailyTime: config.bot.dailyTime, origin: config.publicOrigin, cache });

let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (config.migrateOnStart) await runMigrations(config.databaseUrl);
  logger.info({ tasks: tasks.map((t) => t.name), channels: channels.map((c) => c.id) }, 'bot started');
  while (!stopping) {
    try {
      await tick({ db, now: new Date(), logger }, tasks);
    } catch (error) {
      logger.error({ err: error }, 'bot tick failed');
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
