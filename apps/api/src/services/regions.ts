/** Pages seen from one country or area: every page with a regional block for it. */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Language, Region, RegionEntry } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { pages, revisions } from '../db/schema.js';

export async function regionEntries(db: Database, region: Region, lang: Language): Promise<RegionEntry[]> {
  const rows = await db
    .select({ page: pages, content: revisions.content })
    .from(pages)
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(
      and(
        eq(pages.lang, lang),
        eq(pages.status, 'published'),
        sql`${revisions.content}->'regions' @> ${JSON.stringify([{ region }])}::jsonb`,
      ),
    )
    .orderBy(asc(pages.title))
    .limit(1000);
  return rows.flatMap(({ page, content }) => {
    const block = content.regions.find((entry) => entry.region === region);
    if (!block) return [];
    return [
      {
        lang: page.lang,
        slug: page.slug,
        title: page.title,
        ...(content.emoji ? { emoji: content.emoji } : {}),
        verdict: block.verdict,
        text: block.text,
      },
    ];
  });
}

/** How many published pages say something about each region, for the map. */
export async function regionCounts(db: Database, lang: Language): Promise<Record<string, number>> {
  const result = await db.execute<{ region: string; n: number }>(sql`
    select b->>'region' as region, count(*)::int as n
    from pages p
    join revisions r on r.id = p.current_revision_id
    cross join lateral jsonb_array_elements(coalesce(r.content->'regions', '[]'::jsonb)) b
    where p.lang = ${lang} and p.status = 'published'
    group by 1
  `);
  return Object.fromEntries(result.rows.map((row) => [row.region, Number(row.n)]));
}
