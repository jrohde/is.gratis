import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processNextJob } from '../drafts/process.js';
import { extractJson, LlmError, writeDraft } from '../lib/llm.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
const logger = pino({ level: 'silent' });

beforeAll(async () => {
  ctx = await createTestApp({ drafts: { perIpPerHour: 2, globalPerHour: 100, maxAttempts: 2, pollIntervalMs: 10 } });
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.purged.length = 0;
});

const requestDraft = (slug: string, ip = '203.0.113.7') =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/drafts',
    headers: { 'x-forwarded-for': ip },
    payload: { lang: 'nl', slug },
  });

describe('draft queue', () => {
  it('queues a job, writes a draft page and lets a user publish it', async () => {
    const queued = await requestDraft('kraanwater');
    expect(queued.statusCode).toBe(202);
    const jobId = queued.json().job.id;

    const again = await requestDraft('kraanwater', '198.51.100.1');
    expect(again.statusCode).toBe(200);
    expect(again.json().job.id).toBe(jobId);

    const worked = await processNextJob({
      db: ctx.db,
      config: ctx.config,
      cache: ctx.cache,
      logger,
      write: async () => ({ ok: true, topicKey: 'tap-water', title: 'kraanwater', content: sampleContent() }),
    });
    expect(worked).toBe(true);

    const job = await ctx.app.inject({ method: 'GET', url: `/api/drafts/${jobId}` });
    expect(job.json().job.status).toBe('done');
    expect(ctx.purged).toContain('nl/kraanwater');

    const page = await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/kraanwater' });
    expect(page.json()).toMatchObject({ status: 'draft', topicKey: 'tap-water' });
    expect(page.json().currentRevision).toMatchObject({ source: 'llm', authorName: null });

    const anonymous = await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/kraanwater/publish' });
    expect(anonymous.statusCode).toBe(401);

    const { cookie } = await register(ctx, 'checker@example.com', 'Checker');
    const published = await ctx.app.inject({
      method: 'POST',
      url: '/api/pages/nl/kraanwater/publish',
      headers: { cookie },
    });
    expect(published.json()).toMatchObject({ status: 'published' });
    expect(published.json().currentRevision).toMatchObject({ number: 2, authorName: 'Checker' });

    expect((await requestDraft('kraanwater')).statusCode).toBe(409);
    expect(await processNextJob({ db: ctx.db, config: ctx.config, cache: ctx.cache, logger })).toBe(false);
  });

  it('links a draft to an existing topic as a translation, once per language', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/en/water',
      headers: { cookie },
      payload: { title: 'water', content: sampleContent(), baseRevisionId: null },
    });
    // Humans get a private topic; give it the English key an LLM would suggest.
    await ctx.db.execute(sql`update topics set key = 'water' where key = 'en-water'`);

    const writeWater = async () =>
      ({ ok: true, topicKey: 'water', title: 'agua', content: sampleContent() }) as const;
    const deps = { db: ctx.db, config: ctx.config, cache: ctx.cache, logger, write: writeWater };

    await ctx.app.inject({ method: 'POST', url: '/api/drafts', payload: { lang: 'es', slug: 'agua' } });
    await processNextJob(deps);
    const es = await ctx.app.inject({ method: 'GET', url: '/api/pages/es/agua' });
    expect(es.json().topicKey).toBe('water');
    expect(es.json().translations).toEqual([{ lang: 'en', slug: 'water', title: 'water' }]);

    // A second Spanish page claiming the same topic gets a topic of its own.
    await ctx.app.inject({ method: 'POST', url: '/api/drafts', payload: { lang: 'es', slug: 'agua-potable' } });
    await processNextJob(deps);
    const second = await ctx.app.inject({ method: 'GET', url: '/api/pages/es/agua-potable' });
    expect(second.json().topicKey).toBe('es-agua-potable');
    expect(second.json().translations).toEqual([]);
  });

  it('retries LLM failures and marks rejected subjects as failed', async () => {
    const id = (await requestDraft('qwrtzpl')).json().job.id;
    const failing = async () => {
      throw new LlmError('timeout');
    };
    await processNextJob({ db: ctx.db, config: ctx.config, cache: ctx.cache, logger, write: failing });
    expect((await ctx.app.inject({ method: 'GET', url: `/api/drafts/${id}` })).json().job.status).toBe('queued');
    await processNextJob({ db: ctx.db, config: ctx.config, cache: ctx.cache, logger, write: failing });
    expect((await ctx.app.inject({ method: 'GET', url: `/api/drafts/${id}` })).json().job.status).toBe('failed');

    const other = (await requestDraft('asdfgh', '198.51.100.2')).json().job.id;
    await processNextJob({
      db: ctx.db,
      config: ctx.config,
      cache: ctx.cache,
      logger,
      write: async () => ({ ok: false, reason: 'gibberish' }),
    });
    const job = (await ctx.app.inject({ method: 'GET', url: `/api/drafts/${other}` })).json().job;
    expect(job.status).toBe('failed');
    expect(job.error).toContain('not_a_topic');
  });

  it('rate limits draft requests per IP', async () => {
    expect((await requestDraft('een')).statusCode).toBe(202);
    expect((await requestDraft('twee')).statusCode).toBe(202);
    const third = await requestDraft('drie');
    expect(third.statusCode).toBe(429);
    expect((await requestDraft('drie', '198.51.100.9')).statusCode).toBe(202);
  });
});

describe('LLM client', () => {
  let server: Server;
  let baseUrl: string;
  let reply: unknown;
  let lastBody: { model?: string; messages?: Array<{ role: string; content: string }> } = {};

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        lastBody = JSON.parse(body);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const config = () => ({ baseUrl, apiKey: 'test', model: 'local-model', timeoutMs: 5000 });

  it('calls an OpenAI-compatible endpoint and validates the page', async () => {
    reply = { valid: true, topicKey: 'tap-water', title: 'kraanwater', content: sampleContent() };
    const result = await writeDraft(config(), 'nl', 'kraanwater');
    expect(result).toMatchObject({ ok: true, topicKey: 'tap-water', title: 'kraanwater' });
    expect(lastBody.model).toBe('local-model');
    expect(lastBody.messages?.[0]?.content).toContain('Write the page in Dutch');
    expect(lastBody.messages?.[1]?.content).toContain('Is kraanwater gratis?');
  });

  it('passes on a rejected subject', async () => {
    reply = { valid: false, reason: 'not a thing' };
    expect(await writeDraft(config(), 'en', 'xyz')).toEqual({ ok: false, reason: 'not a thing' });
  });

  it('throws a retryable error for output that breaks the schema', async () => {
    reply = { valid: true, topicKey: 'x', title: 'x', content: { ...sampleContent(), verdict: 'maybe' } };
    await expect(writeDraft(config(), 'nl', 'x')).rejects.toBeInstanceOf(LlmError);
  });

  it('extracts JSON wrapped in code fences', () => {
    expect(extractJson('Sure!\n```json\n{"valid": false, "reason": "x"}\n```')).toEqual({ valid: false, reason: 'x' });
    expect(() => extractJson('no json here')).toThrow(LlmError);
  });
});

describe('sponsored offers', () => {
  it('goes from request to approval to display on the page', async () => {
    const { cookie: editor } = await register(ctx, 'editor@example.com');
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/wifi',
      headers: { cookie: editor },
      payload: { title: 'wifi', content: sampleContent(), baseRevisionId: null },
    });

    const request = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      payload: {
        lang: 'nl',
        slug: 'wifi',
        region: 'NL',
        advertiserName: 'Voorbeeld BV',
        contactEmail: 'Sales@Voorbeeld.nl',
        title: 'Een maand gratis mobiel internet',
        description: 'Proefperiode van een maand, daarna maandelijks opzegbaar.',
        url: 'https://example.com/proef',
      },
    });
    expect(request.statusCode).toBe(201);
    const id = request.json().id;

    let page = await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/wifi' });
    expect(page.json().sponsoredOffers).toHaveLength(0);

    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/sponsors', headers: { cookie: editor } })).statusCode).toBe(403);

    const { cookie: admin } = await register(ctx, 'admin@example.com');
    const list = await ctx.app.inject({ method: 'GET', url: '/api/admin/sponsors?status=pending', headers: { cookie: admin } });
    expect(list.json().bookings[0]).toMatchObject({ id, contactEmail: 'sales@voorbeeld.nl' });

    const approved = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/sponsors/${id}/review`,
      headers: { cookie: admin },
      payload: { status: 'active', startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: null },
    });
    expect(approved.statusCode).toBe(200);
    expect(ctx.purged).toContain('nl/wifi');

    page = await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/wifi' });
    expect(page.json().sponsoredOffers).toEqual([
      expect.objectContaining({ advertiserName: 'Voorbeeld BV', region: 'NL' }),
    ]);
    expect(page.json().sponsoredOffers[0]).not.toHaveProperty('contactEmail');

    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/sponsors/${id}/review`,
      headers: { cookie: admin },
      payload: { status: 'active', startsAt: null, endsAt: new Date(Date.now() - 1000).toISOString() },
    });
    page = await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/wifi' });
    expect(page.json().sponsoredOffers).toHaveLength(0);
  });

  it('rejects HTML in sponsor texts', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      payload: {
        lang: 'nl',
        slug: 'wifi',
        advertiserName: '<b>x</b>',
        contactEmail: 'a@b.nl',
        title: 't',
        description: 'd',
        url: 'https://example.com',
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
