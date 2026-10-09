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

export async function dailyPick(db: Database, lang: Language, day = new Date().toISOString().slice(0, 10)): Promise<PageListItem | null> {
  const result = await db.execute<Row>(sql`
    select p.lang, p.slug, p.title, p.status, p.updated_at, r.content,
      coalesce(r.content->'scale'->>'type' in ('free_good', 'collective', 'third_party'), false) as free
    from pages p join revisions r on r.id = p.current_revision_id
    where p.lang = ${lang} and p.status = 'published'
    order by p.slug
  `);
  // Prefer subjects that are free for (almost) everyone: it is a celebration, not a warning.
  const free = result.rows.filter((row) => row.free);
  const pool = free.length ? free : result.rows;
  if (!pool.length) return null;
  const index = createHash('sha256').update(`${lang}:${day}`).digest().readUInt32BE(0) % pool.length;
  const row = pool[index]!;
  return toListItem(
    { lang: row.lang, slug: row.slug, title: row.title, status: row.status, updatedAt: new Date(row.updated_at) },
    normalizeContent(row.content),
  );
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
