/** Server-only settings. Never import this from code that runs in the browser. */
export const env = {
  apiInternalUrl: (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),
  publicOrigin: (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
  baseDomain: (process.env.BASE_DOMAIN ?? 'localhost').toLowerCase(),
};
