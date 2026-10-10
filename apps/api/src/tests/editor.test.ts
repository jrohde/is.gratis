import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PageContent } from '@isgratis/types';
import { tick } from '../bot/scheduler.js';
import { draftWanted, editorDesk } from '../bot/tasks.js';
import { reviewDraft, type EditorVerdict } from '../lib/editor.js';
import { draftsToReview, reviewDrafts, type EditorDeps } from '../services/editorial.js';
import { getPage, listRevisions, saveRevision } from '../services/pages.js';
import { clearSuggestionCache } from '../services/search.js';
import { createTestApp, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));
afterEach(() => vi.unstubAllGlobals());

const llm = { baseUrl: 'http://llm.test/v1', apiKey: '', model: 'editor-model', timeoutMs: 1000 };
const noCache = { purgePage: async () => {}, purgeAll: async () => {} } as unknown as EditorDeps['cache'];
const alive = async () => ({ ok: true, status: 200, error: null });

function deps(review: (draft: Parameters<typeof reviewDraft>[1]) => Promise<EditorVerdict>, check = alive): EditorDeps {
  return { db: ctx.db, llm, cache: noCache, check, review: async (_config, draft) => review(draft) };
}

async function draft(slug: string, content: PageContent = sampleContent()) {
  await saveRevision(ctx.db, {
    lang: 'nl',
    slug,
    title: slug,
    content,
    editSummary: 'Eerste versie, geschreven door een taalmodel',
    baseRevisionId: null,
    authorId: null,
    source: 'llm',
  });
}

describe('editorial language model', () => {
  it('publishes a good draft once, as the editor', async () => {
    await draft('lucht');
    let calls = 0;
    const result = await reviewDrafts(deps(async () => (calls++, { decision: 'publish', notes: 'Klopt.' })), 5);
    expect(result).toBe('1 published, 0 revised, 0 left for people, 0 failed');
    const page = await getPage(ctx.db, 'nl', 'lucht');
    expect(page.status).toBe('published');
    expect(page.currentRevision.source).toBe('editor');
    expect((await listRevisions(ctx.db, 'nl', 'lucht'))[0]!.editSummary).toContain('Klopt.');
    await reviewDrafts(deps(async () => (calls++, { decision: 'publish', notes: 'x' })), 5);
    expect(calls).toBe(1);
  });

  it('publishes its corrected version, and is told which sources are dead', async () => {
    await draft('water', sampleContent({ verdict: 'yes' }));
    let dead: string[] = [];
    await reviewDrafts(
      deps(
        async (input) => {
          dead = input.deadSources;
          return { decision: 'revise', notes: 'Oordeel bijgesteld.', title: 'water', content: sampleContent({ verdict: 'usually' }) };
        },
        async () => ({ ok: false, status: 404, error: null }),
      ),
      5,
    );
    expect(dead).toEqual(['https://example.com']);
    const page = await getPage(ctx.db, 'nl', 'water');
    expect(page).toMatchObject({ status: 'published', content: { verdict: 'usually' } });
  });

  it('leaves a doubtful draft for people, with its note in the review queue', async () => {
    await draft('maanreis');
    await reviewDrafts(deps(async () => ({ decision: 'reject', notes: 'Te veel onzekere bedragen.' })), 5);
    expect((await getPage(ctx.db, 'nl', 'maanreis')).status).toBe('draft');
    const response = await ctx.app.inject({ method: 'GET', url: '/api/review' });
    expect(response.json().drafts[0]).toMatchObject({ slug: 'maanreis', editorNote: 'Te veel onzekere bedragen.' });
    expect(await draftsToReview(ctx.db, 5)).toEqual([]);
  });

  it('gives up on a draft after three failed attempts', async () => {
    await draft('kapot');
    const failing = deps(async () => {
      throw new Error('model down');
    });
    for (let i = 0; i < 4; i++) await reviewDrafts(failing, 5);
    const rows = await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from editor_reviews where decision = 'error'`);
    expect(rows.rows[0]!.n).toBe(3);
    expect(await draftsToReview(ctx.db, 5)).toEqual([]);
  });

  it('runs as a bot task every ten minutes', async () => {
    await draft('zon');
    const task = editorDesk({ llm, cache: noCache, check: alive, review: async () => ({ decision: 'publish', notes: 'Ok.' }) }, 5);
    await tick({ db: ctx.db, now: new Date('2026-10-10T08:03:00Z'), logger: { info: () => {}, warn: () => {} } }, [task]);
    expect((await getPage(ctx.db, 'nl', 'zon')).status).toBe('published');
    expect(task.due(new Date('2026-10-10T08:09:59Z'))).toEqual(task.due(new Date('2026-10-10T08:00:00Z')));
    expect(task.due(new Date('2026-10-10T08:10:00Z'))).not.toEqual(task.due(new Date('2026-10-10T08:00:00Z')));
  });
});

describe('reviewDraft', () => {
  const answer = (body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }))),
    );
  const input = { lang: 'nl' as const, title: 'water', content: sampleContent(), deadSources: [] };

  it('accepts a revision that only uses the draft’s own sources', async () => {
    answer({ decision: 'revise', notes: 'Ingekort.', title: 'water', content: sampleContent({ whenFree: '- Uit de kraan' }) });
    expect(await reviewDraft(llm, input)).toMatchObject({ decision: 'revise', content: { whenFree: '- Uit de kraan' } });
  });

  it('refuses a revision that adds a source', async () => {
    const content = sampleContent({ sources: [{ id: 'nieuw', title: 'Nieuw', url: 'https://made-up.example' }] });
    answer({ decision: 'revise', notes: 'Bron toegevoegd.', title: 'water', content: { ...content, whenFree: '- Ja[^nieuw]' } });
    await expect(reviewDraft(llm, input)).rejects.toThrow(/added a source/);
  });
});

describe('drafting what people want', () => {
  it('queues drafts for subjects searched often enough, not for one-off searches', async () => {
    await ctx.db.execute(sql`
      insert into search_misses (lang, query, day, count) values
        ('nl', 'fietsenstalling', current_date, 4),
        ('nl', 'eenmalig', current_date, 2)
    `);
    clearSuggestionCache();
    const task = draftWanted({ perDay: 5, time: '03:00', minWeight: 3, globalPerHour: 100, ipHashSalt: 'salt' });
    const now = new Date();
    now.setUTCHours(4, 0, 0, 0);
    await tick({ db: ctx.db, now, logger: { info: () => {}, warn: () => {} } }, [task]);
    const jobs = await ctx.db.execute<{ slug: string }>(sql`select slug from draft_jobs order by slug`);
    expect(jobs.rows.map((row) => row.slug)).toEqual(['fietsenstalling']);
  });
});
