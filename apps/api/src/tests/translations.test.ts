import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processNextJob } from '../drafts/process.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
let cookie: string;
const logger = pino({ level: 'silent' });
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.purged.length = 0;
  cookie = (await register(ctx, 'translator@example.com')).cookie;
  await ctx.app.inject({
    method: 'PUT',
    url: '/api/pages/nl/parkeren',
    headers: { cookie },
    payload: { title: 'parkeren', content: sampleContent({ scale: { type: 'partial', region: 'NL' } }), baseRevisionId: null },
  });
});

const translate = async () => ({ title: 'parking', content: sampleContent({ summary: 'It depends.', scale: { type: 'partial', region: 'NL' } }) });

describe('translations', () => {
  it('translates a checked page into a linked draft in another language', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/translate', payload: { to: 'en' } })).statusCode).toBe(401);
    const queued = await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/translate', headers: { cookie }, payload: { to: 'en' } });
    expect(queued.statusCode).toBe(202);
    expect(queued.json().job).toMatchObject({ kind: 'translation', lang: 'en', status: 'queued' });
    // Asking again returns the same job.
    const again = await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/translate', headers: { cookie }, payload: { to: 'en' } });
    expect(again.json().job.id).toBe(queued.json().job.id);

    expect(await processNextJob({ db: ctx.db, config: ctx.config, cache: ctx.cache, logger, translate })).toBe(true);
    const en = (await ctx.app.inject({ url: '/api/pages/en/parking' })).json();
    expect(en).toMatchObject({ status: 'draft', title: 'parking', currentRevision: { source: 'llm' } });
    expect(en.translations).toEqual([{ lang: 'nl', slug: 'parkeren', title: 'parkeren' }]);
    expect(ctx.purged).toEqual(expect.arrayContaining(['en/parking', 'nl/parkeren']));

    const twice = await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/translate', headers: { cookie }, payload: { to: 'en' } });
    expect(twice.json().error).toBe('page_exists');
  });

  it('does not translate unchecked drafts', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/translate', headers: { cookie }, payload: { to: 'en' } });
    await processNextJob({ db: ctx.db, config: ctx.config, cache: ctx.cache, logger, translate });
    const response = await ctx.app.inject({ method: 'POST', url: '/api/pages/en/parking/translate', headers: { cookie }, payload: { to: 'de' } });
    expect(response.json().error).toBe('not_published');
  });

  it('queues everything missing in a language for admins', async () => {
    const admin = await register(ctx, 'admin@example.com');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/translations',
      headers: { cookie: admin.cookie },
      payload: { from: 'nl', to: 'de' },
    });
    expect(response.json()).toEqual({ queued: 1, skipped: 0 });
  });
});
