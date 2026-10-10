import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { htmlToText } from '../lib/link-check.js';
import { reviewOffer, type OfferForReview, type OfferVerdict } from '../lib/offer-editor.js';
import { reviewOffers } from '../services/editorial.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({ editor: { ...loadConfig().editor, enabled: true } });
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));
afterEach(() => vi.unstubAllGlobals());

const llm = { baseUrl: 'http://llm.test/v1', apiKey: '', model: 'editor-model', timeoutMs: 1000 };
const landing = async () => ({ ok: true, status: 200, text: 'Gratis kraanwater bij elke tafel. Geen aankoop nodig.', error: null });

async function requestOffer(): Promise<string> {
  const { cookie } = await register(ctx, 'writer@example.com');
  await ctx.app.inject({
    method: 'PUT',
    url: '/api/pages/nl/kraanwater',
    headers: { cookie },
    payload: { title: 'kraanwater', content: sampleContent(), baseRevisionId: null },
  });
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/sponsors/requests',
    payload: {
      lang: 'nl',
      slug: 'kraanwater',
      region: 'NL',
      advertiserName: 'Café De Kraan',
      contactEmail: 'kraan@example.com',
      title: 'BESTE gratis water!!!',
      description: 'Altijd gratis kraanwater bij ons.',
      url: 'https://kraan.example',
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id;
}

const advise = (verdict: OfferVerdict, seen: OfferForReview[] = []) => ({
  db: ctx.db,
  llm,
  fetchText: landing,
  review: async (_config: unknown, offer: OfferForReview) => (seen.push(offer), verdict),
});

async function adminCookie() {
  return (await register(ctx, 'admin@example.com', 'Admin')).cookie;
}

const activate = (cookie: string, id: string, extra: object = {}) =>
  ctx.app.inject({ method: 'POST', url: `/api/admin/sponsors/${id}/review`, headers: { cookie }, payload: { status: 'active', ...extra } });

describe('editorial check of sponsored offers', () => {
  it('reads the offer, the page and the landing page, and stores its advice once', async () => {
    const id = await requestOffer();
    const seen: OfferForReview[] = [];
    const verdict: OfferVerdict = { decision: 'approve', notes: 'Echt gratis.', suggestion: { title: 'Gratis kraanwater' } };
    expect(await reviewOffers(advise(verdict, seen), 5)).toBe('1 approved, 0 rejected, 0 unsure, 0 failed');
    expect(seen[0]).toMatchObject({ page: { title: 'kraanwater' }, landingText: expect.stringContaining('Geen aankoop'), region: 'NL' });
    await reviewOffers(advise(verdict, seen), 5);
    expect(seen).toHaveLength(1);

    const cookie = await adminCookie();
    const list = await ctx.app.inject({ method: 'GET', url: '/api/admin/sponsors', headers: { cookie } });
    expect(list.json().bookings.find((b: { id: string }) => b.id === id).editor).toMatchObject({ decision: 'approve', notes: 'Echt gratis.' });
  });

  it('will not activate an offer the editor did not approve, unless the admin overrides', async () => {
    const id = await requestOffer();
    const cookie = await adminCookie();
    expect((await activate(cookie, id)).statusCode).toBe(409);
    await reviewOffers(advise({ decision: 'reject', notes: 'Proefabonnement, niet gratis.' }), 5);
    expect((await activate(cookie, id)).json().error).toBe('editor_not_approved');
    const forced = await activate(cookie, id, { override: true });
    expect(forced.statusCode).toBe(200);
    expect(forced.json().booking.status).toBe('active');
  });

  it('can take over the suggested neutral wording when approving', async () => {
    const id = await requestOffer();
    await reviewOffers(advise({ decision: 'approve', notes: 'Ok.', suggestion: { title: 'Gratis kraanwater' } }), 5);
    const response = await activate(await adminCookie(), id, { applySuggestion: true });
    expect(response.json().booking).toMatchObject({ status: 'active', title: 'Gratis kraanwater', description: 'Altijd gratis kraanwater bij ons.' });
  });

  it('leaves an offer to the admin after three failed attempts', async () => {
    await requestOffer();
    const failing = { db: ctx.db, llm, fetchText: landing, review: async () => Promise.reject(new Error('model down')) };
    for (let i = 0; i < 4; i++) await reviewOffers(failing, 5);
    const rows = await ctx.db.execute<{ editor_attempts: number }>(sql`select editor_attempts from sponsored_offers`);
    expect(rows.rows[0]!.editor_attempts).toBe(3);
  });
});

describe('reviewOffer', () => {
  const answer = (body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }))),
    );
  const offer: OfferForReview = {
    lang: 'nl',
    advertiserName: 'X',
    title: 'Gratis water',
    description: 'Water',
    url: 'https://x.example',
    region: null,
    page: { title: 'water', summary: 'Ja.' },
    landingText: null,
    landingError: 'Timed out',
  };

  it('does not approve what it could not read', async () => {
    answer({ decision: 'approve', notes: 'Lijkt goed.' });
    expect((await reviewOffer(llm, offer)).decision).toBe('unsure');
    expect((await reviewOffer(llm, { ...offer, landingText: 'Gratis water.', landingError: null })).decision).toBe('approve');
  });
});

describe('htmlToText', () => {
  it('keeps what a visitor reads and drops scripts, styles and tags', () => {
    const html = '<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Gratis&nbsp;water</h1><p>Geen <b>aankoop</b> nodig &amp; altijd vers.</p></body></html>';
    expect(htmlToText(html)).toBe('Gratis water\nGeen aankoop nodig & altijd vers.');
  });
});
