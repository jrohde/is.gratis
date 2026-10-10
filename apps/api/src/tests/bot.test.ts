import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PageListItem } from '@isgratis/types';
import { blueskyChannel, mastodonChannel, type Channel, type Post } from '../bot/publishers.js';
import { recentRuns, tick, type BotTask } from '../bot/scheduler.js';
import { composePost, expireOffers, postDaily } from '../bot/tasks.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
const logger = { info: () => {}, warn: () => {} };
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));

const at = (iso: string) => ({ db: ctx.db, now: new Date(iso), logger });

describe('scheduler', () => {
  it('runs each key once, also when two replicas tick at the same time', async () => {
    let runs = 0;
    const task: BotTask = { name: 'count', due: () => ['once'], run: async () => `run ${++runs}` };
    await Promise.all([tick(at('2026-10-10T08:00:00Z'), [task]), tick(at('2026-10-10T08:00:00Z'), [task])]);
    await tick(at('2026-10-10T09:00:00Z'), [task]);
    expect(runs).toBe(1);
    expect((await recentRuns(ctx.db, 5))[0]).toMatchObject({ task: 'count', key: 'once', status: 'done', detail: 'run 1' });
  });

  it('tries a failed run again, at most three times', async () => {
    let calls = 0;
    const task: BotTask = {
      name: 'flaky',
      due: () => ['x'],
      run: async () => {
        calls++;
        throw new Error('down');
      },
    };
    for (let i = 0; i < 5; i++) await tick(at('2026-10-10T08:00:00Z'), [task]);
    expect(calls).toBe(3);
    expect((await recentRuns(ctx.db, 1))[0]).toMatchObject({ status: 'failed', attempts: 3, detail: 'down' });
  });
});

describe('daily post', () => {
  it('posts the free thing of the day once per channel, from the configured time', async () => {
    const { cookie } = await register(ctx, 'bot@example.com');
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/lucht',
      headers: { cookie },
      payload: { title: 'lucht', content: sampleContent({ summary: 'De lucht die je inademt is overal gratis.', scale: { type: 'free_good', region: 'WORLD' } }), baseRevisionId: null },
    });
    const posts: Post[] = [];
    const channel: Channel = { id: 'test:nl', lang: 'nl', maxLength: 500, publish: async (post) => (posts.push(post), 'ok') };
    const task = postDaily([channel], { time: '07:00', origin: 'https://is.gratis' });
    await tick(at('2026-10-10T06:59:00Z'), [task]);
    expect(posts).toEqual([]);
    await tick(at('2026-10-10T07:00:00Z'), [task]);
    await tick(at('2026-10-10T12:00:00Z'), [task]);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.text).toBe('Lucht is gratis* *echt\n\nDe lucht die je inademt is overal gratis.\n\nhttps://is.gratis/nl/lucht');
    expect(posts[0]!.idempotencyKey).toBe('isgratis-test:nl:2026-10-10');
  });

  it('shortens the text to fit a channel', () => {
    const page = { lang: 'nl', slug: 'x', title: 'x', verdict: 'yes', status: 'published', summary: 'woord '.repeat(100), updatedAt: '' } as PageListItem;
    expect(composePost(page, 'https://is.gratis/nl/x', 300).length).toBeLessThanOrEqual(300);
  });
});

describe('channels', () => {
  it('posts to Mastodon with an idempotency key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ url: 'https://social.example/@isgratis/1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const channel = mastodonChannel({ lang: 'nl', url: 'https://social.example/', token: 'secret' }, fake);
    const result = await channel.publish({ text: 'hoi', link: 'https://is.gratis', lang: 'nl', idempotencyKey: 'k1' });
    expect(result).toBe('https://social.example/@isgratis/1');
    expect(calls[0]!.url).toBe('https://social.example/api/v1/statuses');
    expect((calls[0]!.init.headers as Record<string, string>)['idempotency-key']).toBe('k1');
  });

  it('marks the link for Bluesky in UTF-8 bytes', async () => {
    const bodies: unknown[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (url.endsWith('createSession')) return new Response(JSON.stringify({ accessJwt: 'jwt', did: 'did:plc:x' }));
      return new Response(JSON.stringify({ uri: 'at://x' }));
    }) as unknown as typeof fetch;
    const channel = blueskyChannel({ lang: 'nl', identifier: 'is.gratis', password: 'app' }, fake);
    await channel.publish({ text: 'Crème is gratis* https://is.gratis/nl/creme', link: 'https://is.gratis/nl/creme', lang: 'nl', idempotencyKey: 'k' });
    const record = (bodies[1] as { record: { facets: Array<{ index: { byteStart: number; byteEnd: number } }> } }).record;
    // "Crème is gratis* " is 18 bytes: the è takes two.
    expect(record.facets[0]!.index).toEqual({ byteStart: 18, byteEnd: 18 + 'https://is.gratis/nl/creme'.length });
  });
});

describe('expire offers', () => {
  it('ends offers past their end date', async () => {
    const admin = await register(ctx, 'admin@example.com');
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/parkeren',
      headers: { cookie: admin.cookie },
      payload: { title: 'parkeren', content: sampleContent(), baseRevisionId: null },
    });
    const request = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      payload: { lang: 'nl', slug: 'parkeren', advertiserName: 'A', contactEmail: 'a@example.com', title: 'T', description: 'D', url: 'https://example.com' },
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/sponsors/${request.json().id}/review`,
      headers: { cookie: admin.cookie },
      payload: { status: 'active', startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-02-01T00:00:00Z' },
    });
    await tick(at('2026-10-10T08:00:00Z'), [expireOffers(ctx.cache)]);
    const bookings = (await ctx.app.inject({ url: '/api/admin/sponsors?status=expired', headers: { cookie: admin.cookie } })).json().bookings;
    expect(bookings).toHaveLength(1);
  });
});
