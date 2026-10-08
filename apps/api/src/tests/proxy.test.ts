import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  // One trusted proxy (Varnish) in front of the API.
  ctx = await createTestApp({
    trustProxy: 1,
    drafts: { perIpPerHour: 2, globalPerHour: 100, maxAttempts: 2, pollIntervalMs: 10 },
  });
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));

describe('client IP behind proxies', () => {
  it('ignores X-Forwarded-For entries a client added itself', async () => {
    const request = (slug: string, spoofed: string) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/drafts',
        // The client sent "spoofed"; the trusted proxy appended the real address.
        headers: { 'x-forwarded-for': `${spoofed}, 203.0.113.50` },
        payload: { lang: 'nl', slug },
      });
    expect((await request('een', '10.0.0.1')).statusCode).toBe(202);
    expect((await request('twee', '10.0.0.2')).statusCode).toBe(202);
    expect((await request('drie', '10.0.0.3')).statusCode).toBe(429);
  });
});
