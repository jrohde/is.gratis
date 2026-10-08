import pino from 'pino';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createCacheInvalidator } from './lib/cache.js';

const config = loadConfig();
const logger = pino({ level: config.logLevel, name: 'api' });

async function main() {
  if (config.migrateOnStart) await runMigrations(config.databaseUrl);
  const { db, pool } = createDatabase(config.databaseUrl, config.databasePoolMax);
  const cache = createCacheInvalidator(config.cacheBanTarget, logger);
  const app = await buildApp({ config, db, cache, logger });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'api failed to start');
  process.exit(1);
});
