/**
 * "Gratis van de dag": one subject per day that is really free, the same for everyone. The pick
 * is a hash of the date over the published pages, so it needs no table and no cron job.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { normalizeContent, type Language, type PageContent, type PageListItem, type PageStatus } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { toListItem } from './pages.js';

type Row = { lang: Language; slug: string; title: string; status: PageStatus; updated_at: string | Date; content: PageContent; free: boolean };

/** Published pages to pick from, the really free ones first choice. */
async function dailyPool(db: Database, lang: Language): Promise<Row[]> {
  const result = await db.execute<Row>(sql`
    select p.lang, p.slug, p.title, p.status, p.updated_at, r.content,
      coalesce(r.content->'scale'->>'type' in ('free_good', 'collective', 'third_party'), false) as free
    from pages p join revisions r on r.id = p.current_revision_id
    where p.lang = ${lang} and p.status = 'published'
    order by p.slug
  `);
  // Prefer subjects that are free for (almost) everyone: it is a celebration, not a warning.
  const free = result.rows.filter((row) => row.free);
  return free.length ? free : result.rows;
}

function pick(pool: Row[], lang: Language, day: string): PageListItem | null {
  if (!pool.length) return null;
  const index = createHash('sha256').update(`${lang}:${day}`).digest().readUInt32BE(0) % pool.length;
  const row = pool[index]!;
  return toListItem(
    { lang: row.lang, slug: row.slug, title: row.title, status: row.status, updatedAt: new Date(row.updated_at) },
    normalizeContent(row.content),
  );
}

export async function dailyPick(db: Database, lang: Language, day = new Date().toISOString().slice(0, 10)): Promise<PageListItem | null> {
  return pick(await dailyPool(db, lang), lang, day);
}

/** Random published pages with a free scale, for the quiz: the scale is what players guess. */
export async function quizQuestions(db: Database, lang: Language, count: number): Promise<PageListItem[]> {
  const result = await db.execute<Row>(sql`
    select p.lang, p.slug, p.title, p.status, p.updated_at, r.content, false as free
    from pages p join revisions r on r.id = p.current_revision_id
    where p.lang = ${lang} and p.status = 'published' and r.content ? 'scale'
    order by random()
    limit ${count}
  `);
  return result.rows.map((row) =>
    toListItem(
      { lang: row.lang, slug: row.slug, title: row.title, status: row.status, updatedAt: new Date(row.updated_at) },
      normalizeContent(row.content),
    ),
  );
}

/** The free things of the last days, newest first: the week page and the daily feed. */
export async function dailyHistory(db: Database, lang: Language, days: number): Promise<Array<{ day: string; page: PageListItem }>> {
  const pool = await dailyPool(db, lang);
  const result: Array<{ day: string; page: PageListItem }> = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const page = pick(pool, lang, day);
    if (page) result.push({ day, page });
  }
  return result;
}

/** Pages published for the first time in the last week. */
export async function newThisWeek(db: Database, lang: Language, limit: number): Promise<PageListItem[]> {
  const result = await db.execute<Row>(sql`
    select p.lang, p.slug, p.title, p.status, p.updated_at, r.content, false as free
    from pages p join revisions r on r.id = p.current_revision_id
    where p.lang = ${lang} and p.status = 'published' and p.created_at > now() - interval '7 days'
    order by p.created_at desc
    limit ${limit}
  `);
  return result.rows.map((row) =>
    toListItem(
      { lang: row.lang, slug: row.slug, title: row.title, status: row.status, updatedAt: new Date(row.updated_at) },
      normalizeContent(row.content),
    ),
  );
}
