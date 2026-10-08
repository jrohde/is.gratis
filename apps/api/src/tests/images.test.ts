import pino from 'pino';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processNextJob } from '../drafts/process.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
const logger = pino({ level: 'silent' });

const png = (width: number, height: number, color = '#2f9e44') =>
  sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

beforeAll(async () => {
  ctx = await createTestApp({
    images: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:1',
      apiKey: '',
      model: 'test-image-model',
      size: '1536x1024',
      timeoutMs: 1000,
      perUserPerHour: 1,
      globalPerHour: 10,
    },
  });
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.purged.length = 0;
});

async function upload(cookie: string | undefined, body: Buffer, type = 'image/png') {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/assets',
    headers: { 'content-type': type, ...(cookie ? { cookie } : {}) },
    payload: body,
  });
}

async function createPage(cookie: string, slug = 'water') {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/pages/nl/${slug}`,
    headers: { cookie },
    payload: { title: slug, content: sampleContent(), baseRevisionId: null },
  });
}

describe('image uploads', () => {
  it('requires a login, rejects non-images and normalises to WebP', async () => {
    expect((await upload(undefined, await png(10, 10))).statusCode).toBe(401);

    const { cookie } = await register(ctx, 'editor@example.com');
    const fake = await upload(cookie, Buffer.from('not an image'));
    expect(fake.statusCode).toBe(400);
    expect(fake.json().error).toBe('invalid_image');

    const big = await upload(cookie, await png(3200, 1600));
    expect(big.statusCode).toBe(201);
    const asset = big.json().asset;
    expect(asset).toMatchObject({ width: 1600, height: 800, source: 'upload' });

    // The same image twice is stored once.
    expect((await upload(cookie, await png(3200, 1600))).json().asset.id).toBe(asset.id);

    const media = await ctx.app.inject({ method: 'GET', url: `/api/media/${asset.id}.webp` });
    expect(media.statusCode).toBe(200);
    expect(media.headers['content-type']).toBe('image/webp');
    expect(media.headers['cache-control']).toContain('immutable');
    expect((await sharp(media.rawPayload).metadata()).format).toBe('webp');

    const small = await ctx.app.inject({ method: 'GET', url: `/api/media/${asset.id}.webp?w=480` });
    expect((await sharp(small.rawPayload).metadata()).width).toBe(480);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/media/${asset.id}.webp?w=123` })).statusCode).toBe(400);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/media/00000000-0000-0000-0000-000000000000.webp' })).statusCode,
    ).toBe(404);
  });

  it('takes size and the AI label from the stored image, not from the client', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    const asset = (await upload(cookie, await png(800, 600))).json().asset;
    const save = await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/water',
      headers: { cookie },
      payload: {
        title: 'water',
        content: sampleContent({ image: { assetId: asset.id, alt: 'Een glas water', width: 1, height: 1, ai: true } }),
        baseRevisionId: null,
      },
    });
    expect(save.statusCode).toBe(201);
    expect(save.json().content.image).toEqual({ assetId: asset.id, alt: 'Een glas water', width: 800, height: 600, ai: false });

    const unknown = await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/lucht',
      headers: { cookie },
      payload: {
        title: 'lucht',
        content: sampleContent({
          image: { assetId: '00000000-0000-0000-0000-000000000000', alt: 'x', width: 1, height: 1, ai: false },
        }),
        baseRevisionId: null,
      },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error).toBe('unknown_image');
  });

  it('validates the new content fields', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    const attempt = (content: object) =>
      ctx.app.inject({
        method: 'PUT',
        url: '/api/pages/nl/test',
        headers: { cookie },
        payload: { title: 'test', content: { ...sampleContent(), ...content }, baseRevisionId: null },
      });
    expect((await attempt({ emoji: 'abc' })).statusCode).toBe(400);
    expect((await attempt({ scale: { type: 'very_free', region: 'NL' } })).statusCode).toBe(400);
    expect((await attempt({ facts: [{ label: '<b>x</b>', value: 'y' }] })).statusCode).toBe(400);
    expect(
      (await attempt({ timePrice: { unit: 'x', price: 1, hourlyWage: 0, currency: 'EUR', region: 'NL', source: { title: 's', url: 'https://example.com' } } }))
        .statusCode,
    ).toBe(400);
    const ok = await attempt({
      emoji: '💧',
      scale: { type: 'collective', region: 'NL' },
      timePrice: { unit: '1 liter', price: 0.0015, hourlyWage: 20, currency: 'EUR', region: 'NL', source: { title: 's', url: 'https://example.com' } },
      facts: [{ label: 'Sinds', value: '2010' }],
      trivia: ['Een weetje.'],
      background: 'Uitleg.',
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().content).toMatchObject({ emoji: '💧', scale: { type: 'collective' }, trivia: ['Een weetje.'] });
  });

  it('reports whether image generation is available', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/config' })).json()).toEqual({ imageGeneration: true });
  });
});

describe('image generation', () => {
  it('generates an image for the editor without changing the page', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    await createPage(cookie);
    const anonymous = await ctx.app.inject({ method: 'POST', url: '/api/images/generate', payload: { lang: 'nl', slug: 'water' } });
    expect(anonymous.statusCode).toBe(401);

    const queued = await ctx.app.inject({
      method: 'POST',
      url: '/api/images/generate',
      headers: { cookie },
      payload: { lang: 'nl', slug: 'water' },
    });
    expect(queued.statusCode).toBe(202);
    expect(queued.json().job).toMatchObject({ kind: 'image', status: 'queued', asset: null });

    let prompt = '';
    await processNextJob({
      db: ctx.db,
      config: ctx.config,
      cache: ctx.cache,
      logger,
      generate: async (_config, text) => {
        prompt = text;
        return png(1536, 1024, '#1c7ed6');
      },
    });
    expect(prompt).toContain('Is water gratis?');
    expect(prompt).toContain('No text');

    const job = (await ctx.app.inject({ method: 'GET', url: `/api/drafts/${queued.json().job.id}` })).json().job;
    expect(job).toMatchObject({ status: 'done', asset: { width: 1536, height: 1024, source: 'ai' } });
    const page = (await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/water' })).json();
    expect(page.content.image).toBeUndefined();

    // One per hour per person in this test configuration.
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/images/generate',
      headers: { cookie },
      payload: { lang: 'nl', slug: 'water' },
    });
    expect(second.statusCode).toBe(429);
  });

  it('can illustrate every new LLM draft automatically', async () => {
    const config = { ...ctx.config, drafts: { ...ctx.config.drafts, withImage: true } };
    await ctx.app.inject({ method: 'POST', url: '/api/drafts', payload: { lang: 'nl', slug: 'kraanwater' } });
    const deps = {
      db: ctx.db,
      config,
      cache: ctx.cache,
      logger,
      write: async () => ({ ok: true as const, topicKey: 'tap-water', title: 'kraanwater', content: sampleContent() }),
      generate: async () => png(1536, 1024),
    };
    await processNextJob(deps); // the page
    await processNextJob(deps); // its image
    const page = (await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/kraanwater' })).json();
    expect(page.status).toBe('draft');
    expect(page.content.image).toMatchObject({ alt: 'Illustratie bij kraanwater', ai: true, width: 1536 });
    expect(page.currentRevision).toMatchObject({ number: 2, source: 'llm', editSummary: 'Afbeelding gegenereerd' });
  });

  it('never lets the page model set an image or a time price', async () => {
    const { writeDraft } = await import('../lib/llm.js');
    const { createServer } = await import('node:http');
    const answer = {
      valid: true,
      topicKey: 'x',
      title: 'x',
      content: {
        ...sampleContent(),
        image: { assetId: '00000000-0000-0000-0000-000000000000', alt: 'x', width: 1, height: 1, ai: false },
        timePrice: { unit: 'x', price: 1, hourlyWage: 10, currency: 'EUR', region: 'NL', source: { title: 's', url: 'https://example.com' } },
      },
    };
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const result = await writeDraft({ baseUrl: `http://127.0.0.1:${port}`, apiKey: '', model: 'm', timeoutMs: 2000 }, 'nl', 'x');
    server.close();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).not.toHaveProperty('image');
      expect(result.content).not.toHaveProperty('timePrice');
    }
  });
});
