import { runMigrations } from '../db/migrate.js';
import { testDatabaseUrl } from './helpers.js';

export default async function setup() {
  await runMigrations(testDatabaseUrl());
}
