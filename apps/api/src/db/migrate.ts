/**
 * Applies the SQL migrations in ./drizzle.
 *
 * A Postgres advisory lock makes it safe to call this from every replica on startup or from
 * an init container: only one process migrates at a time, the others wait and then find
 * nothing left to do.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const MIGRATION_LOCK_ID = 727_001;

export function migrationsFolder(): string {
  // Works both from src/ (tsx) and from dist/ (compiled): the folder sits next to them.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'drizzle');
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    await client.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/isgratis';
  runMigrations(url)
    .then(() => {
      console.log('Migrations applied');
    })
    .catch((error: unknown) => {
      console.error('Migration failed', error);
      process.exit(1);
    });
}
