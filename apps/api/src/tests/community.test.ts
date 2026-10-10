import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../db/schema.js';
import { isPrivateAddress } from '../lib/link-check.js';
import { saveRevision } from '../services/pages.js';
import { runSourceChecks } from '../services/sources.js';
import { quotePrice } from '../services/views.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({ sponsorPricing: { baseCents: 2500, perThousandCents: 400, mailingCents: 500, exclusivePercent: 250 } });
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.purged.length = 0;
});

async function createPage(cookie: string, slug = 'parkeren', content = sampleContent()) {
  const response = await ctx.app.inject({
    method: 'PUT',
    url: `/api/pages/nl/${slug}`,
    headers: { cookie },
    payload: { title: slug, content, baseRevisionId: null },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function makeRole(userId: string, role: 'moderator' | 'admin') {
  await ctx.db.update(users).set({ role }).where(eq(users.id, userId));
}

async function llmDraft(slug: string) {
  await saveRevision(ctx.db, {
    lang: 'nl',
    slug,
    title: slug,
    content: sampleContent({ whenFree: '- Soms [^voorbeeld]', whenNotFree: '- Soms niet' }),
    editSummary: 'Eerste versie',
    baseRevisionId: null,
    authorId: null,
    source: 'llm',
  });
}

describe('source checks', () => {
  it('refuses private and internal addresses', () => {
    for (const address of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '1.1.1.1', '2606:4700::1111', '172.32.0.1']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('checks due source URLs and shows the result on the page', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    await createPage(cookie);
    const checked: string[] = [];
    const deps = {
      db: ctx.db,
      cache: ctx.cache,
      logger: { info: () => {} },
      check: async (url: string) => {
        checked.push(url);
        return { ok: false, status: 404, error: null };
      },
    };
    ctx.purged.length = 0;
    expect(await runSourceChecks(deps, { intervalDays: 7, batchSize: 10 })).toBe(1);
    expect(checked).toEqual(['https://example.com']);
    expect(ctx.purged).toEqual(['nl/parkeren']);
    // Checked recently: nothing is due.
    expect(await runSourceChecks(deps, { intervalDays: 7, batchSize: 10 })).toBe(0);
    const page = (await ctx.app.inject({ url: '/api/pages/nl/parkeren' })).json();
    expect(page.sourceChecks['https://example.com']).toMatchObject({ ok: false, status: 404 });
  });
});

describe('watchlist and talk pages', () => {
  it('follows a page and shows when it changed', async () => {
    const anna = await register(ctx, 'anna@example.com', 'Anna');
    const bob = await register(ctx, 'bob@example.com', 'Bob');
    const page = await createPage(anna.cookie);
    expect((await ctx.app.inject({ method: 'PUT', url: '/api/pages/nl/parkeren/watch' })).statusCode).toBe(401);
    await ctx.app.inject({ method: 'PUT', url: '/api/pages/nl/parkeren/watch', headers: { cookie: anna.cookie } });
    expect((await ctx.app.inject({ url: '/api/pages/nl/parkeren/watch', headers: { cookie: anna.cookie } })).json()).toEqual({ watching: true });

    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/parkeren',
      headers: { cookie: bob.cookie },
      payload: { title: 'parkeren', content: sampleContent({ verdict: 'no' }), baseRevisionId: page.currentRevision.id },
    });
    const list = await ctx.app.inject({ url: '/api/watchlist', headers: { cookie: anna.cookie } });
    expect(list.json().pages).toEqual([expect.objectContaining({ slug: 'parkeren', revision: 2, seenRevision: 1 })]);

    // Visiting the page while following it marks the change as seen.
    await ctx.app.inject({ method: 'PUT', url: '/api/pages/nl/parkeren/watch', headers: { cookie: anna.cookie } });
    expect((await ctx.app.inject({ url: '/api/watchlist', headers: { cookie: anna.cookie } })).json().pages[0].seenRevision).toBe(2);

    await ctx.app.inject({ method: 'DELETE', url: '/api/pages/nl/parkeren/watch', headers: { cookie: anna.cookie } });
    expect((await ctx.app.inject({ url: '/api/watchlist', headers: { cookie: anna.cookie } })).json().pages).toEqual([]);
  });

  it('posts messages on the talk page and lets moderators hide them', async () => {
    const anna = await register(ctx, 'anna@example.com', 'Anna');
    await createPage(anna.cookie);
    ctx.purged.length = 0;
    const posted = await ctx.app.inject({
      method: 'POST',
      url: '/api/pages/nl/parkeren/comments',
      headers: { cookie: anna.cookie },
      payload: { body: 'Klopt dit voor Amsterdam?' },
    });
    expect(posted.statusCode).toBe(201);
    expect(ctx.purged).toEqual(['nl/parkeren']);
    expect((await ctx.app.inject({ url: '/api/pages/nl/parkeren' })).json().commentCount).toBe(1);

    const id = posted.json().comment.id;
    expect((await ctx.app.inject({ method: 'POST', url: `/api/comments/${id}/hide`, headers: { cookie: anna.cookie }, payload: { hidden: true } })).statusCode).toBe(403);
    await makeRole(anna.user.id, 'moderator');
    await ctx.app.inject({ method: 'POST', url: `/api/comments/${id}/hide`, headers: { cookie: anna.cookie }, payload: { hidden: true } });

    expect((await ctx.app.inject({ url: '/api/pages/nl/parkeren/comments' })).json().comments).toEqual([]);
    const moderatorView = await ctx.app.inject({ url: '/api/pages/nl/parkeren/comments', headers: { cookie: anna.cookie } });
    expect(moderatorView.json().comments).toEqual([expect.objectContaining({ authorName: 'Anna', hidden: true })]);
    expect((await ctx.app.inject({ url: '/api/pages/nl/parkeren' })).json().commentCount).toBe(0);
  });
});

describe('reports', () => {
  it('lets anyone report a page and moderators handle it', async () => {
    const anna = await register(ctx, 'reporter@example.com', 'Anna');
    await createPage(anna.cookie);
    const sent = await ctx.app.inject({
      method: 'POST',
      url: '/api/pages/nl/parkeren/reports',
      payload: { reason: 'outdated', message: 'De tarieven zijn veranderd.' },
    });
    expect(sent.statusCode).toBe(201);
    expect((await ctx.app.inject({ url: '/api/reports', headers: { cookie: anna.cookie } })).statusCode).toBe(403);
    await makeRole(anna.user.id, 'moderator');
    const list = (await ctx.app.inject({ url: '/api/reports', headers: { cookie: anna.cookie } })).json().reports;
    expect(list).toEqual([expect.objectContaining({ slug: 'parkeren', reason: 'outdated', message: 'De tarieven zijn veranderd.' })]);
    const resolved = await ctx.app.inject({ method: 'POST', url: `/api/reports/${list[0].id}/resolve`, headers: { cookie: anna.cookie } });
    expect(resolved.statusCode).toBe(204);
    expect((await ctx.app.inject({ url: '/api/reports', headers: { cookie: anna.cookie } })).json().reports).toEqual([]);
  });
});

describe('protection and moderation', () => {
  it('lets only moderators edit a protected page', async () => {
    const anna = await register(ctx, 'protect@example.com');
    const page = await createPage(anna.cookie);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/protect', headers: { cookie: anna.cookie }, payload: { protected: true } })).statusCode).toBe(403);
    await makeRole(anna.user.id, 'moderator');
    await ctx.app.inject({ method: 'POST', url: '/api/pages/nl/parkeren/protect', headers: { cookie: anna.cookie }, payload: { protected: true } });
    expect((await ctx.app.inject({ url: '/api/pages/nl/parkeren' })).json().protected).toBe(true);
    const summary = await ctx.app.inject({ url: '/api/moderation/summary', headers: { cookie: anna.cookie } });
    expect(summary.json()).toEqual({ drafts: 0, reports: 0 });

    const bob = await register(ctx, 'bob-protect@example.com');
    const edit = await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/parkeren',
      headers: { cookie: bob.cookie },
      payload: { title: 'parkeren', content: sampleContent({ verdict: 'no' }), baseRevisionId: page.currentRevision.id },
    });
    expect(edit.statusCode).toBe(403);
    expect(edit.json().error).toBe('protected');
  });
});
