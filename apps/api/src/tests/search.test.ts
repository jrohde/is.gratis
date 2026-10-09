import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearSuggestionCache, related } from '../services/search.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
let cookie: string;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx);
  clearSuggestionCache();
  cookie = (await register(ctx, 'search@example.com')).cookie;
});

async function create(slug: string, title: string, content = sampleContent()) {
  const response = await ctx.app.inject({
    method: 'PUT',
    url: `/api/pages/nl/${slug}`,
    headers: { cookie },
    payload: { title, content, baseRevisionId: null },
  });
  expect(response.statusCode).toBe(201);
}

describe('full-text search', () => {
  it('finds words anywhere on a page, with stemming and highlighted fragments', async () => {
    await create('museum', 'een museum', sampleContent({ summary: 'Veel musea zijn gratis voor kinderen.' }));
    await create('fiets', 'de fiets', sampleContent({ background: 'Fietsen huren kost geld; je eigen fiets parkeren vaak niet.' }));
    const response = await ctx.app.inject({ url: '/api/search/full?lang=nl&q=fietsen' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.results[0]).toMatchObject({ slug: 'fiets' });
    expect(body.results[0].snippet).toContain('\u0002');
  });

  it('ranks title matches first and reports an exact page', async () => {
    await create('water', 'water', sampleContent({ summary: 'Kraanwater kost weinig.' }));
    await create('thee', 'thee', sampleContent({ summary: 'Thee zet je met water.' }));
    const body = (await ctx.app.inject({ url: '/api/search/full?lang=nl&q=water' })).json();
    expect(body.results.map((r: { slug: string }) => r.slug)).toEqual(['water', 'thee']);
    expect(body.exact).toBe('water');
  });

  it('suggests a similar title and counts searches that find nothing', async () => {
    await create('water', 'water');
    const body = (await ctx.app.inject({ url: '/api/search/full?lang=nl&q=waterr' })).json();
    expect(body.total).toBe(0);
    expect(body.didYouMean).toMatchObject({ slug: 'water' });
    await ctx.app.inject({ url: '/api/search/full?lang=nl&q=Zonnebrand' });
    const misses = await ctx.db.execute(sql`select query, count from search_misses order by query`);
    expect(misses.rows).toEqual([
      { query: 'waterr', count: 1 },
      { query: 'zonnebrand', count: 1 },
    ]);
  });
});

describe('suggestions', () => {
  it('suggests pages, then wanted subjects, then what was typed', async () => {
    await create('water', 'water', sampleContent({ whenFree: '- Bij een [[watertappunt]] in de stad' }));
    await create('thee', 'thee', sampleContent({ whenFree: '- Soms bij een [[watertappunt]]' }));
    const body = (await ctx.app.inject({ url: '/api/suggest?lang=nl&q=wate' })).json();
    expect(body.pages.map((p: { slug: string }) => p.slug)).toEqual(['water']);
    expect(body.missing[0]).toEqual({ slug: 'watertappunt', title: 'watertappunt', reason: 'wanted' });
    // Half a word that matches something is not offered as a subject of its own.
    expect(body.missing.some((m: { reason: string }) => m.reason === 'typed')).toBe(false);
    const typed = (await ctx.app.inject({ url: '/api/suggest?lang=nl&q=Zwem%20les' })).json();
    expect(typed.missing.at(-1)).toEqual({ slug: 'zwem-les', title: 'Zwem les', reason: 'typed' });

    const wanted = (await ctx.app.inject({ url: '/api/wanted?lang=nl' })).json();
    expect(wanted.subjects[0]).toMatchObject({ slug: 'watertappunt', weight: 6 });
  });

  it('turns searches that keep finding nothing into suggestions', async () => {
    for (let i = 0; i < 2; i++) await ctx.app.inject({ url: '/api/search/full?lang=nl&q=zwembad' });
    clearSuggestionCache();
    const body = (await ctx.app.inject({ url: '/api/suggest?lang=nl&q=zwem' })).json();
    expect(body.missing[0]).toEqual({ slug: 'zwembad', title: 'zwembad', reason: 'searched' });
  });

  it('asks the language model for related subjects once per query', async () => {
    await create('water', 'water');
    let calls = 0;
    const ask = async () => {
      calls++;
      return ['water', 'kraanwater', 'flessenwater'];
    };
    const first = await related(ctx.db, ctx.config, 'nl', 'Drinken', ask);
    expect(first.pages.map((p) => p.slug)).toEqual(['water']);
    expect(first.missing.map((m) => m.slug)).toEqual(['kraanwater', 'flessenwater']);
    await related(ctx.db, ctx.config, 'nl', 'drinken ', ask);
    expect(calls).toBe(1);
    const limited = await related(ctx.db, { ...ctx.config, search: { relatedEnabled: true, relatedPerHour: 1 } }, 'nl', 'eten', ask);
    expect(limited).toEqual({ pages: [], missing: [] });
    expect(calls).toBe(1);
  });
});
