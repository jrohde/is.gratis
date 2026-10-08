import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
}

export function createDatabase(url: string, max = 10): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max });
  return { db: drizzle(pool, { schema }), pool };
}
