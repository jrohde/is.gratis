import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.purged.length = 0;
});

async function createPage(cookie: string, slug = 'parkeren') {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/pages/nl/${slug}`,
    headers: { cookie },
    payload: { title: slug, content: sampleContent(), editSummary: 'Eerste versie', baseRevisionId: null },
  });
}

describe('pages', () => {
  it('requires a login to edit', async () => {
    const response = await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/parkeren',
      payload: { title: 'parkeren', content: sampleContent(), baseRevisionId: null },
    });
    expect(response.statusCode).toBe(401);
  });

  it('creates a published page, edits it and keeps history', async () => {
    const { cookie } = await register(ctx, 'editor@example.com', 'Eddie');
    const created = await createPage(cookie);
    expect(created.statusCode).toBe(201);
    const page = created.json();
    expect(page).toMatchObject({ lang: 'nl', slug: 'parkeren', status: 'published', topicKey: 'nl-parkeren' });
    expect(page.currentRevision).toMatchObject({ number: 1, source: 'human', authorName: 'Eddie' });
    expect(ctx.purged).toContain('nl/parkeren');

    const edited = await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/parkeren',
      headers: { cookie },
      payload: {
        title: 'parkeren',
        content: sampleContent({ verdict: 'no', summary: 'Nee.' }),
        editSummary: 'Oordeel aangepast',
        baseRevisionId: page.currentRevision.id,
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().content.verdict).toBe('no');
    expect(edited.json().currentRevision.number).toBe(2);

    const history = await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/parkeren/revisions' });
    expect(history.json().revisions.map((r: { number: number }) => r.number)).toEqual([2, 1]);

    const first = await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/parkeren/revisions/1' });
    expect(first.json().content.verdict).toBe('depends');
  });

  it('rejects an edit based on an outdated revision', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    const page = (await createPage(cookie)).json();
    const save = (summary: string) =>
      ctx.app.inject({
        method: 'PUT',
        url: '/api/pages/nl/parkeren',
        headers: { cookie },
        payload: {
          title: 'parkeren',
          content: sampleContent({ summary }),
          baseRevisionId: page.currentRevision.id,
        },
      });
    expect((await save('Eerste bewerking.')).statusCode).toBe(200);
    const stale = await save('Tweede bewerking op een oude versie.');
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('edit_conflict');
  });

  it('reverts to an older revision as a new revision', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    const page = (await createPage(cookie)).json();
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/parkeren',
      headers: { cookie },
      payload: { title: 'parkeren', content: sampleContent({ summary: 'Vandalisme' }), baseRevisionId: page.currentRevision.id },
    });
    const reverted = await ctx.app.inject({
      method: 'POST',
      url: '/api/pages/nl/parkeren/revert',
      headers: { cookie },
      payload: { number: 1 },
    });
    expect(reverted.statusCode).toBe(200);
    expect(reverted.json().content.summary).toBe('Hangt ervan af.');
    expect(reverted.json().currentRevision).toMatchObject({ number: 3, editSummary: 'Teruggezet naar versie 1' });
  });

  it('rejects HTML, duplicate regions and bad URLs in content', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    const attempts = [
      sampleContent({ summary: '<script>alert(1)</script>' }),
      sampleContent({
        regions: [
          { region: 'NL', verdict: 'yes', text: 'a' },
          { region: 'NL', verdict: 'no', text: 'b' },
        ],
      }),
      sampleContent({ sources: [{ id: 'x', title: 'x', url: 'javascript:alert(1)' }] }),
    ];
    for (const content of attempts) {
      const response = await ctx.app.inject({
        method: 'PUT',
        url: '/api/pages/nl/parkeren',
        headers: { cookie },
        payload: { title: 'parkeren', content, baseRevisionId: null },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('gives sources ids and refuses citations to sources that do not exist', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    const save = (content: object) =>
      ctx.app.inject({
        method: 'PUT',
        url: '/api/pages/nl/bronnen',
        headers: { cookie },
        payload: { title: 'bronnen', content: { ...sampleContent(), ...content }, baseRevisionId: null },
      });
    const unknown = await save({ whenFree: 'Gratis.[^bestaat-niet]' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().message).toContain('[^bestaat-niet]');

    const duplicate = await save({ sources: [{ id: 'a', title: 'A', url: 'https://a.nl' }, { id: 'a', title: 'B', url: 'https://b.nl' }] });
    expect(duplicate.statusCode).toBe(400);

    const ok = await save({
      whenFree: 'Gratis.[^drinkwater-wikipedia]',
      sources: [{ title: 'Drinkwater Wikipedia', url: 'https://nl.wikipedia.org/wiki/Drinkwater' }],
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().content.sources).toEqual([
      { id: 'drinkwater-wikipedia', title: 'Drinkwater Wikipedia', url: 'https://nl.wikipedia.org/wiki/Drinkwater' },
    ]);
  });

  it('returns 404 for unknown pages and validates slugs', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/bestaat-niet' })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/Bad_Slug' })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pages/fr/water' })).statusCode).toBe(400);
  });

  it('lists pages and resolves a slug to the visitor language', async () => {
    const { cookie } = await register(ctx, 'editor@example.com');
    await createPage(cookie, 'wifi');
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/en/wifi',
      headers: { cookie },
      payload: { title: 'wifi', content: sampleContent(), baseRevisionId: null },
    });

    const list = await ctx.app.inject({ method: 'GET', url: '/api/pages?lang=nl' });
    expect(list.json().pages).toHaveLength(1);

    const english = await ctx.app.inject({
      method: 'GET',
      url: '/api/resolve/wifi',
      headers: { 'accept-language': 'en-GB,en;q=0.9,nl;q=0.5' },
    });
    expect(english.json()).toEqual({ lang: 'en', slug: 'wifi', exists: true });

    const german = await ctx.app.inject({
      method: 'GET',
      url: '/api/resolve/wifi',
      headers: { 'accept-language': 'de-DE' },
    });
    expect(german.json().exists).toBe(true);
    expect(['nl', 'en']).toContain(german.json().lang);

    const missing = await ctx.app.inject({
      method: 'GET',
      url: '/api/resolve/onbekend',
      headers: { 'accept-language': 'es-ES' },
    });
    expect(missing.json()).toEqual({ lang: 'es', slug: 'onbekend', exists: false });

    const sitemap = await ctx.app.inject({ method: 'GET', url: '/api/sitemap' });
    expect(sitemap.json().entries).toHaveLength(2);
  });

  it('serves the OpenAPI document', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths)).toContain('/api/pages/{lang}/{slug}');
  });
});
