import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../db/schema.js';
import { isPrivateAddress } from '../lib/link-check.js';
import { saveRevision } from '../services/pages.js';
import { runSourceChecks } from '../services/sources.js';
import { spotPrice } from '../services/pricing.js';

const PRICES = { baseCents: 2500, perThousandCents: 400, mailingCents: 500, exclusivePercent: 250, regionPercent: { BE: 50 } };
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

describe('views and sponsor prices', () => {
  it('counts views of published pages and prices a spot by them', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    await createPage(cookie);
    for (let i = 0; i < 3; i++) {
      const response = await ctx.app.inject({ method: 'POST', url: '/api/views', payload: { lang: 'nl', slug: 'parkeren' } });
      expect(response.statusCode).toBe(204);
    }
    // Unknown pages are ignored without an error.
    expect((await ctx.app.inject({ method: 'POST', url: '/api/views', payload: { lang: 'nl', slug: 'bestaat-niet' } })).statusCode).toBe(204);

    const quote = await ctx.app.inject({ url: '/api/sponsors/quote?lang=nl&slug=parkeren' });
    expect(quote.json()).toEqual({ views30: 3, priceCents: 2600, regionPercent: 100, mailingPriceCents: 500, slotsFree: 3, exclusivePriceCents: 6500, exclusiveAvailable: true, currency: 'EUR' });

    const request = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      payload: {
        lang: 'nl',
        slug: 'parkeren',
        advertiserName: 'Fietsjes',
        contactEmail: 'ad@example.com',
        title: 'Gratis proefrit',
        description: 'Een dag gratis fietsen.',
        url: 'https://example.com/fiets',
      },
    });
    expect(request.statusCode).toBe(201);
    expect(request.json().priceCents).toBe(2600);
  });

  it('rounds prices up to whole euros', () => {
    expect(spotPrice(0, null, PRICES)).toBe(2500);
    expect(spotPrice(10_000, null, PRICES)).toBe(6500);
    expect(spotPrice(1, null, PRICES)).toBe(2600);
    // A region costs its percentage of the everywhere price, rounded up to whole euros.
    expect(spotPrice(1, 'BE', PRICES)).toBe(1300);
    expect(spotPrice(1, 'NL', PRICES)).toBe(2600);
  });

  it('shows view statistics to admins only', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    expect((await ctx.app.inject({ url: '/api/admin/views', headers: { cookie } })).statusCode).toBe(403);
    const admin = await register(ctx, 'admin@example.com');
    await createPage(admin.cookie);
    await ctx.app.inject({ method: 'POST', url: '/api/views', payload: { lang: 'nl', slug: 'parkeren' } });
    const stats = await ctx.app.inject({ url: '/api/admin/views', headers: { cookie: admin.cookie } });
    expect(stats.json().pages).toEqual([
      { lang: 'nl', slug: 'parkeren', title: 'parkeren', views30: 1, priceCents: 2600 },
    ]);
  });
});

describe('review queue', () => {
  it('lists drafts oldest first with how well they are sourced', async () => {
    await llmDraft('eerste');
    await llmDraft('tweede');
    const response = await ctx.app.inject({ url: '/api/review?lang=nl' });
    const drafts = response.json().drafts;
    expect(drafts.map((d: { slug: string }) => d.slug)).toEqual(['eerste', 'tweede']);
    expect(drafts[0]).toMatchObject({ status: 'draft', claims: 3, cited: 1, sources: 1 });
  });

  it('lets moderators delete drafts and only admins delete published pages', async () => {
    const user = await register(ctx, 'mod@example.com');
    await llmDraft('rommel');
    expect((await ctx.app.inject({ method: 'DELETE', url: '/api/pages/nl/rommel', headers: { cookie: user.cookie } })).statusCode).toBe(403);
    await makeRole(user.user.id, 'moderator');
    const deleted = await ctx.app.inject({ method: 'DELETE', url: '/api/pages/nl/rommel', headers: { cookie: user.cookie } });
    expect(deleted.statusCode).toBe(204);
    expect(ctx.purged).toContain('nl/rommel');
    expect((await ctx.app.inject({ url: '/api/pages/nl/rommel' })).statusCode).toBe(404);
    const topics = await ctx.db.execute(sql`select key from topics`);
    expect(topics.rows).toEqual([]);

    await createPage(user.cookie, 'water');
    expect((await ctx.app.inject({ method: 'DELETE', url: '/api/pages/nl/water', headers: { cookie: user.cookie } })).statusCode).toBe(403);
    const admin = await register(ctx, 'admin@example.com');
    expect((await ctx.app.inject({ method: 'DELETE', url: '/api/pages/nl/water', headers: { cookie: admin.cookie } })).statusCode).toBe(204);
  });

  it('queues many drafts at once for admins and skips existing pages', async () => {
    const admin = await register(ctx, 'admin@example.com');
    await createPage(admin.cookie, 'water');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/drafts',
      headers: { cookie: admin.cookie },
      payload: { lang: 'nl', slugs: ['lucht', 'water', 'zonlicht', 'lucht'] },
    });
    expect(response.json()).toEqual({ queued: ['lucht', 'zonlicht'], skipped: [{ slug: 'water', reason: 'page_exists' }] });
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/drafts',
      headers: { cookie: admin.cookie },
      payload: { lang: 'nl', slugs: ['lucht'] },
    });
    expect(again.json().skipped).toEqual([{ slug: 'lucht', reason: 'already_queued' }]);
  });
});

describe('regions', () => {
  it('lists every published page with a block for a region', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    await createPage(cookie, 'parkeren');
    await createPage(
      cookie,
      'zorg',
      sampleContent({ regions: [{ region: 'BE', verdict: 'no', text: 'Niet in België.' }] }),
    );
    const nl = await ctx.app.inject({ url: '/api/regions/nl?lang=nl' });
    expect(nl.json()).toEqual({
      region: 'NL',
      pages: [{ lang: 'nl', slug: 'parkeren', title: 'parkeren', verdict: 'depends', text: 'Per gemeente verschillend.' }],
    });
    const counts = await ctx.app.inject({ url: '/api/regions?lang=nl' });
    expect(counts.json().counts).toEqual({ NL: 1, BE: 1 });
    expect((await ctx.app.inject({ url: '/api/regions/XX?lang=nl' })).statusCode).toBe(400);
  });
});

describe('offers overview', () => {
  it('lists running offers with their page', async () => {
    const admin = await register(ctx, 'admin@example.com');
    await createPage(admin.cookie);
    const request = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      payload: {
        lang: 'nl', slug: 'parkeren', advertiserName: 'Fietsjes', contactEmail: 'ad@example.com',
        title: 'Gratis proefrit', description: 'Een dag gratis fietsen.', url: 'https://example.com/fiets',
      },
    });
    expect((await ctx.app.inject({ url: '/api/offers?lang=nl' })).json().offers).toEqual([]);
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/sponsors/${request.json().id}/review`,
      headers: { cookie: admin.cookie },
      payload: { status: 'active' },
    });
    const offers = (await ctx.app.inject({ url: '/api/offers?lang=nl' })).json().offers;
    expect(offers).toEqual([expect.objectContaining({ title: 'Gratis proefrit', page: expect.objectContaining({ slug: 'parkeren' }) })]);

    // Shown twice, clicked once; the advertiser sees it behind their secret link.
    const id = offers[0].id;
    for (let i = 0; i < 2; i++) await ctx.app.inject({ method: 'POST', url: '/api/offers/impressions', payload: { ids: [id] } });
    const click = await ctx.app.inject({ url: `/api/offers/${id}/go` });
    expect(click.statusCode).toBe(302);
    expect(click.headers.location).toBe('https://example.com/fiets');
    const stats = await ctx.app.inject({ url: `/api/sponsors/stats/${request.json().statsToken}` });
    expect(stats.json().totals).toMatchObject({ impressions: 2, clicks: 1, mailClicks: 0 });
    expect(stats.json().offer).toMatchObject({ title: 'Gratis proefrit', status: 'active' });
    expect(stats.json().offer.contactEmail).toBeUndefined();
    expect((await ctx.app.inject({ url: '/api/sponsors/stats/not-a-real-token-at-all' })).statusCode).toBe(404);

    // Renewal: a new pending request with its own link, at today's price.
    const token = request.json().statsToken;
    const options = (await ctx.app.inject({ url: `/api/sponsors/stats/${token}/options` })).json();
    expect(options.current).toMatchObject({ slug: 'parkeren' });
    const renewed = await ctx.app.inject({ method: 'POST', url: `/api/sponsors/stats/${token}/renew`, payload: {} });
    expect(renewed.statusCode).toBe(201);
    expect(renewed.json().statsToken).not.toBe(token);
    const pending = (await ctx.app.inject({ url: '/api/admin/sponsors?status=pending', headers: { cookie: admin.cookie } })).json().bookings;
    expect(pending).toEqual([expect.objectContaining({ slug: 'parkeren', title: 'Gratis proefrit' })]);
  });
});
