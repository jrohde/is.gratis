/**
 * Page views per day. The browser sends one beacon per page view; nothing identifies the
 * visitor. The counts set the price of a sponsored spot.
 */
import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import type { Language } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { pages, pageViews } from '../db/schema.js';

const daysAgo = (days: number) => sql`(current_date - ${days}::int)`;

/** Counts one view of a published page. Unknown pages and drafts are ignored. */
export async function recordView(db: Database, lang: Language, slug: string): Promise<boolean> {
  const result = await db.execute(sql`
    insert into page_views (page_id, day, count)
    select id, current_date, 1 from pages where lang = ${lang} and slug = ${slug} and status = 'published'
    on conflict (page_id, day) do update set count = page_views.count + 1
  `);
  return (result.rowCount ?? 0) > 0;
}

export async function viewsLast30Days(db: Database, lang: Language, slug: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(pageViews.count) })
    .from(pageViews)
    .innerJoin(pages, eq(pages.id, pageViews.pageId))
    .where(and(eq(pages.lang, lang), eq(pages.slug, slug), gte(pageViews.day, daysAgo(30))));
  return Number(row?.total ?? 0);
}

/**
 * Published pages an advertiser can choose from, busiest first, optionally matching a search
 * in the title. Pages without visits are included: they are the cheapest place to start.
 */
export async function advertisablePages(db: Database, lang: Language, query: string, limit: number) {
  const pattern = `%${query.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const result = await db.execute<{ slug: string; title: string; content: { emoji?: string; plural?: boolean }; views30: number }>(sql`
    select p.slug, p.title, r.content, coalesce(v.total, 0)::int as views30
    from pages p
    join revisions r on r.id = p.current_revision_id
    left join (
      select page_id, sum(count) as total from page_views where day >= current_date - 30 group by page_id
    ) v on v.page_id = p.id
    where p.lang = ${lang} and p.status = 'published' and (${query.trim() === ''} or p.title ilike ${pattern})
    order by views30 desc, p.title
    limit ${limit}
  `);
  return result.rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    views30: Number(row.views30),
    ...(row.content.emoji ? { emoji: row.content.emoji } : {}),
    ...(row.content.plural ? { plural: true } : {}),
  }));
}

export async function topViewed(db: Database, limit: number, lang?: Language) {
  const total = sum(pageViews.count).mapWith(Number);
  const rows = await db
    .select({ lang: pages.lang, slug: pages.slug, title: pages.title, views30: total })
    .from(pageViews)
    .innerJoin(pages, eq(pages.id, pageViews.pageId))
    .where(and(gte(pageViews.day, daysAgo(30)), lang ? eq(pages.lang, lang) : undefined))
    .groupBy(pages.id)
    .orderBy(desc(total))
    .limit(limit);
  return rows;
}

/**
 * Monthly price of a sponsored spot: a base price plus a price per thousand views, based on
 * the last 30 days, rounded up to whole euros. A quiet page stays affordable; a busy one
 * costs what it is worth.
 */
export function quotePrice(views30: number, pricing: { baseCents: number; perThousandCents: number }): number {
  const cents = pricing.baseCents + (views30 / 1000) * pricing.perThousandCents;
  return Math.ceil(cents / 100) * 100;
}
