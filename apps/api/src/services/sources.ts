/** Automatic checks of the source URLs on published pages. */
import { eq, inArray, sql } from 'drizzle-orm';
import type { Language, SourceCheck } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { sourceChecks } from '../db/schema.js';
import type { CacheInvalidator } from '../lib/cache.js';
import type { LinkCheckResult } from '../lib/link-check.js';

/** Source URLs of published pages that were never checked or not for `days` days. */
export async function dueSourceUrls(db: Database, days: number, limit: number): Promise<string[]> {
  const result = await db.execute<{ url: string }>(sql`
    with urls as (
      select distinct s->>'url' as url
      from pages p
      join revisions r on r.id = p.current_revision_id
      cross join lateral jsonb_array_elements(coalesce(r.content->'sources', '[]'::jsonb)) s
      where p.status = 'published'
      union
      select distinct f->>'sourceUrl'
      from pages p
      join revisions r on r.id = p.current_revision_id
      cross join lateral jsonb_array_elements(coalesce(r.content->'facts', '[]'::jsonb)) f
      where p.status = 'published' and f ? 'sourceUrl'
    )
    select urls.url from urls
    left join source_checks c on c.url = urls.url
    where urls.url is not null and (c.url is null or c.checked_at < now() - make_interval(days => ${days}))
    order by c.checked_at nulls first
    limit ${limit}
  `);
  return result.rows.map((row) => row.url);
}

/** Stores a check; returns whether the outcome (working or not) changed. */
export async function saveSourceCheck(db: Database, url: string, result: LinkCheckResult): Promise<boolean> {
  const [previous] = await db.select({ ok: sourceChecks.ok }).from(sourceChecks).where(eq(sourceChecks.url, url));
  const row = { url, ok: result.ok, status: result.status, error: result.error, checkedAt: new Date() };
  await db.insert(sourceChecks).values(row).onConflictDoUpdate({ target: sourceChecks.url, set: row });
  return previous?.ok !== result.ok;
}

/** Pages that cite a URL, to refresh their cached HTML when the check result changes. */
export async function pagesCiting(db: Database, url: string): Promise<Array<{ lang: Language; slug: string }>> {
  const result = await db.execute<{ lang: Language; slug: string }>(sql`
    select p.lang, p.slug from pages p
    join revisions r on r.id = p.current_revision_id
    where r.content->'sources' @> ${JSON.stringify([{ url }])}::jsonb
       or r.content->'facts' @> ${JSON.stringify([{ sourceUrl: url }])}::jsonb
  `);
  return result.rows;
}

/** Checks a batch of due URLs. Returns how many were checked. */
export async function runSourceChecks(
  deps: {
    db: Database;
    cache: CacheInvalidator;
    check: (url: string) => Promise<LinkCheckResult>;
    logger: { info: (obj: object, msg: string) => void };
  },
  options: { intervalDays: number; batchSize: number },
): Promise<number> {
  const urls = await dueSourceUrls(deps.db, options.intervalDays, options.batchSize);
  for (const url of urls) {
    const result = await deps.check(url);
    const changed = await saveSourceCheck(deps.db, url, result);
    if (changed) {
      deps.logger.info({ url, ok: result.ok, status: result.status, error: result.error }, 'source check changed');
      for (const page of await pagesCiting(deps.db, url)) await deps.cache.purgePage(page.lang, page.slug);
    }
  }
  return urls.length;
}

export async function sourceChecksFor(db: Database, urls: string[]): Promise<Record<string, SourceCheck>> {
  if (urls.length === 0) return {};
  const rows = await db.select().from(sourceChecks).where(inArray(sourceChecks.url, urls));
  return Object.fromEntries(
    rows.map((row) => [row.url, { ok: row.ok, status: row.status, checkedAt: row.checkedAt.toISOString() }]),
  );
}
