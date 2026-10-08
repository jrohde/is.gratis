/**
 * Draft worker: a separate process (and Kubernetes Deployment) that writes LLM drafts.
 * Scale it on the number of queued jobs, e.g. with KEDA's PostgreSQL scaler.
 */
import pino from 'pino';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createCacheInvalidator } from './lib/cache.js';
import { processNextJob } from './drafts/process.js';

const config = loadConfig();
const logger = pino({ level: config.logLevel, name: 'draft-worker' });
const { db, pool } = createDatabase(config.databaseUrl, 2);
const cache = createCacheInvalidator(config.cacheBanTarget, logger);

let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (config.migrateOnStart) await runMigrations(config.databaseUrl);
  if (!config.llm.apiKey && config.llm.baseUrl.includes('api.openai.com')) {
    logger.warn('LLM_API_KEY is empty; drafts will fail until it is set');
  }
  logger.info({ model: config.llm.model, baseUrl: config.llm.baseUrl }, 'worker started');
  while (!stopping) {
    try {
      const worked = await processNextJob({ db, config, cache, logger });
      if (!worked) await sleep(config.drafts.pollIntervalMs);
    } catch (error) {
      logger.error({ err: error }, 'worker loop error');
      await sleep(config.drafts.pollIntervalMs * 2);
    }
  }
  await pool.end();
  logger.info('worker stopped');
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'stopping after the current job');
    stopping = true;
  });
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'worker crashed');
  process.exit(1);
});
