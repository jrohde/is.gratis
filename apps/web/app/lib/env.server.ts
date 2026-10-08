/** Server-only settings. Never import this from code that runs in the browser. */
import { existsSync } from 'node:fs';

// Local development: read apps/web/.env. Variables that are already set win.
if (existsSync('.env')) process.loadEnvFile('.env');

export const env = {
  apiInternalUrl: (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),
  publicOrigin: (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
  baseDomain: (process.env.BASE_DOMAIN ?? 'localhost').toLowerCase(),
};
