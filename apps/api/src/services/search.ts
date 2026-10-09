/**
 * Search, like Wikipedia's: full text in every language with stemming (Postgres text search,
 * see migration 0003), "did you mean" from title similarity, and suggestions for subjects that
 * have no page yet. Nothing leaves the database except the optional question to the language
 * model for related subjects.
 */
import { and, eq, gt, inArray, like, sql } from 'drizzle-orm';
import {
  normalizeContent,
  slugWithoutArticle,
  STARTER_TOPICS,
  toSlug,
  type Language,
  type MissingSubject,
  type PageContent,
  type PageListItem,
  type PageStatus,
  type SearchResponse,
  type SuggestionReason,
  type Suggestions,
} from '@isgratis/types';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { draftJobs, pages, relatedSubjects, revisions, searchMisses } from '../db/schema.js';
import { suggestRelated } from '../lib/llm.js';
import { searchPages, toListItem } from './pages.js';

/** Lowercase, single spaces: one form per query for counting and caching. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

type PageRow = {
  lang: Language;
  slug: string;
  title: string;
  status: PageStatus;
  updated_at: Date | string;
  content: PageContent;
};

const asListItem = (row: PageRow): PageListItem =>
  toListItem(
    { lang: row.lang, slug: row.slug, title: row.title, status: row.status, updatedAt: new Date(row.updated_at) },
    normalizeContent(row.content),
  );

export async function searchFull(
  db: Database,
  lang: Language,
  query: string,
  options: { limit: number; offset: number },
): Promise<SearchResponse> {
  const q = query.trim().slice(0, 100);
  const result = await db.execute<PageRow & { snippet: string; total: number }>(sql`
    with q as (
      select websearch_to_tsquery(isgratis_ts_config(${lang}), ${q}) || websearch_to_tsquery('simple', ${q}) as query
    )
    select p.lang, p.slug, p.title, p.status, p.updated_at, r.content,
      ts_headline(
        isgratis_ts_config(p.lang),
        concat_ws(' ', isgratis_plain(r.content->>'summary'), isgratis_plain(r.content->>'whenFree'),
          isgratis_plain(r.content->>'whenNotFree'), isgratis_plain(r.content->>'background')),
        q.query,
        'StartSel=' || chr(2) || ', StopSel=' || chr(3) || ', MaxWords=26, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "'
      ) as snippet,
      count(*) over ()::int as total
    from pages p
    join revisions r on r.id = p.current_revision_id
    cross join q
    where p.lang = ${lang} and p.search_doc @@ q.query
    order by ts_rank_cd(p.search_doc, q.query, 32) * (case when p.status = 'published' then 1 else 0.6 end) desc, p.title
    limit ${options.limit} offset ${options.offset}
  `);
  const results = result.rows.map((row) => ({ ...asListItem(row), snippet: row.snippet }));
  const total = result.rows[0]?.total ?? 0;

  const slug = toSlug(q);
  const candidates = [slug, slugWithoutArticle(slug, lang)].filter((value): value is string => Boolean(value));
  const [exact] = candidates.length
    ? await db
        .select({ slug: pages.slug })
        .from(pages)
        .where(and(eq(pages.lang, lang), inArray(pages.slug, candidates)))
        .limit(1)
    : [];

  let didYouMean: PageListItem | null = null;
  if (total < 3 && !exact) {
    const shown = results.map((r) => r.slug);
    const similar = await db.execute<PageRow>(sql`
      select p.lang, p.slug, p.title, p.status, p.updated_at, r.content
      from pages p join revisions r on r.id = p.current_revision_id
      where p.lang = ${lang} and lower(p.title) % ${q.toLowerCase()}
        ${shown.length ? sql`and p.slug not in (${sql.join(shown.map((s) => sql`${s}`), sql`, `)})` : sql``}
      order by similarity(lower(p.title), ${q.toLowerCase()}) desc
      limit 1
    `);
    didYouMean = similar.rows[0] ? asListItem(similar.rows[0]) : null;
  }
  return { query: q, results, total, didYouMean, exact: exact?.slug ?? null };
}

/** Counts a search that found nothing. Only words, nothing about who searched. */
export async function recordMiss(db: Database, lang: Language, query: string): Promise<void> {
  const q = normalizeQuery(query);
  if (q.length < 2 || !toSlug(q)) return;
  await db.execute(sql`
    insert into search_misses (lang, query, day, count) values (${lang}, ${q}, current_date, 1)
    on conflict (lang, query, day) do update set count = search_misses.count + 1
  `);
}

interface Candidate extends MissingSubject {
  weight: number;
}
interface Pool {
  at: number;
  existing: Set<string>;
  rejected: Set<string>;
  candidates: Candidate[];
}
const POOL_MS = 5 * 60 * 1000;
const pools = new Map<Language, Pool>();
const WEIGHT: Record<Exclude<SuggestionReason, 'typed' | 'related'>, number> = { wanted: 3, translation: 2, searched: 1, starter: 1 };

export function clearSuggestionCache(): void {
  pools.clear();
}

/**
 * Subjects without a page, from cheap to dear: red links on other pages, topics that exist in
 * other languages, searches that found nothing, and the starter list. Cached per process.
 */
async function poolFor(db: Database, lang: Language): Promise<Pool> {
  const cached = pools.get(lang);
  if (cached && Date.now() - cached.at < POOL_MS) return cached;

  const [existingRows, rejectedRows, wantedRows, missRows, topicRows] = await Promise.all([
    db.select({ slug: pages.slug }).from(pages).where(eq(pages.lang, lang)),
    db
      .selectDistinct({ slug: draftJobs.slug })
      .from(draftJobs)
      .where(and(eq(draftJobs.lang, lang), eq(draftJobs.status, 'failed'), like(draftJobs.error, 'not_a_topic%'))),
    db.execute<{ target: string; n: number }>(sql`
      select m[1] as target, count(distinct p.id)::int as n
      from pages p
      join revisions r on r.id = p.current_revision_id
      cross join lateral regexp_matches(r.content::text, '\\[\\[([^\\]|]+)', 'g') m
      where p.lang = ${lang} and p.status = 'published'
      group by 1
    `),
    db
      .select({ query: searchMisses.query, n: sql<number>`sum(${searchMisses.count})::int` })
      .from(searchMisses)
      .where(and(eq(searchMisses.lang, lang), gt(searchMisses.day, sql`current_date - 30`)))
      .groupBy(searchMisses.query)
      .having(sql`sum(${searchMisses.count}) >= 2`),
    // Topic keys are English slugs; pages created by hand get "nl-slug" keys, which say nothing.
    lang === 'en'
      ? db.execute<{ key: string }>(sql`
          select t.key from topics t
          where t.key !~ '^(nl|en|de|es)-'
            and not exists (select 1 from pages p where p.topic_id = t.id and p.lang = 'en')
        `)
      : Promise.resolve({ rows: [] as Array<{ key: string }> }),
  ]);

  const existing = new Set(existingRows.map((row) => row.slug));
  const rejected = new Set(rejectedRows.map((row) => row.slug));
  const merged = new Map<string, Candidate>();
  const add = (title: string, reason: Candidate['reason'], weight: number) => {
    const slug = toSlug(title);
    if (!slug || existing.has(slug) || rejected.has(slug)) return;
    const bare = slugWithoutArticle(slug, lang);
    if (bare && existing.has(bare)) return;
    const current = merged.get(slug);
    if (!current) merged.set(slug, { slug, title: title.trim(), reason, weight });
    else {
      current.weight += weight;
      if (WEIGHT[reason as keyof typeof WEIGHT] > WEIGHT[current.reason as keyof typeof WEIGHT]) current.reason = reason;
    }
  };
  for (const row of wantedRows.rows) add(row.target.toLowerCase(), 'wanted', WEIGHT.wanted * Number(row.n));
  for (const row of topicRows.rows) add(row.key.replace(/-/g, ' '), 'translation', WEIGHT.translation);
  for (const row of missRows) add(row.query, 'searched', WEIGHT.searched * Number(row.n));
  for (const title of STARTER_TOPICS[lang]) add(title, 'starter', WEIGHT.starter);

  const pool = { at: Date.now(), existing, rejected, candidates: [...merged.values()].sort((a, b) => b.weight - a.weight) };
  pools.set(lang, pool);
  return pool;
}

/** Subjects without a page, most wanted first: a to-do list for writers. */
export async function wantedSubjects(db: Database, lang: Language, limit: number): Promise<Array<MissingSubject & { weight: number }>> {
  const pool = await poolFor(db, lang);
  return pool.candidates.filter((c) => c.reason !== 'starter').slice(0, limit);
}

/** As-you-type suggestions: existing pages, then subjects that have no page yet. */
export async function suggest(db: Database, lang: Language, query: string, limit = 5): Promise<Suggestions> {
  const q = query.trim();
  const needle = toSlug(q);
  const found = await searchPages(db, lang, q, limit);
  if (!needle) return { pages: found, missing: [] };
  const pool = await poolFor(db, lang);
  const shown = new Set(found.map((page) => page.slug));
  const matches = pool.candidates
    .filter((c) => !shown.has(c.slug) && c.slug.includes(needle))
    .sort((a, b) => Number(b.slug.startsWith(needle)) - Number(a.slug.startsWith(needle)) || b.weight - a.weight)
    .slice(0, 4)
    .map(({ slug, title, reason }) => ({ slug, title, reason }));
  // What was typed is a subject too: once it is clearly not the start of something that exists.
  const startsSomething = found.some((page) => page.slug.startsWith(needle)) || matches.some((m) => m.slug.startsWith(needle));
  const typed =
    needle.length >= 4 && !startsSomething && !pool.existing.has(needle) && !pool.rejected.has(needle)
      ? [{ slug: needle, title: q.replace(/\s+/g, ' '), reason: 'typed' as const }]
      : [];
  return { pages: found, missing: [...matches, ...typed] };
}

/**
 * Subjects related to a query, asked from the language model once per query and kept in the
 * database. Limited per hour across all replicas by counting the cached rows.
 */
export async function related(
  db: Database,
  config: Pick<Config, 'llm' | 'search'>,
  lang: Language,
  query: string,
  ask: typeof suggestRelated = suggestRelated,
): Promise<Suggestions> {
  const q = normalizeQuery(query);
  if (q.length < 2) return { pages: [], missing: [] };
  let [row] = await db
    .select({ subjects: relatedSubjects.subjects })
    .from(relatedSubjects)
    .where(and(eq(relatedSubjects.lang, lang), eq(relatedSubjects.query, q)))
    .limit(1);
  if (!row) {
    if (!config.search.relatedEnabled) return { pages: [], missing: [] };
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(relatedSubjects)
      .where(gt(relatedSubjects.createdAt, sql`now() - interval '1 hour'`));
    if (n >= config.search.relatedPerHour) return { pages: [], missing: [] };
    let subjects: string[];
    try {
      subjects = await ask(config.llm, lang, q);
    } catch {
      return { pages: [], missing: [] };
    }
    await db.insert(relatedSubjects).values({ lang, query: q, subjects }).onConflictDoNothing();
    row = { subjects };
  }

  const pool = await poolFor(db, lang);
  const slugs = [...new Set(row.subjects.map((title) => toSlug(title)).filter(Boolean))];
  const existingRows = slugs.length
    ? await db
        .select({ page: pages, content: revisions.content })
        .from(pages)
        .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
        .where(and(eq(pages.lang, lang), inArray(pages.slug, slugs)))
    : [];
  const bySlug = new Map(existingRows.map(({ page, content }) => [page.slug, toListItem(page, normalizeContent(content))]));
  const result: Suggestions = { pages: [], missing: [] };
  for (const title of row.subjects) {
    const slug = toSlug(title);
    if (!slug || pool.rejected.has(slug)) continue;
    const page = bySlug.get(slug);
    if (page) {
      if (!result.pages.some((p) => p.slug === slug)) result.pages.push(page);
    } else if (!result.missing.some((m) => m.slug === slug)) {
      result.missing.push({ slug, title: title.trim(), reason: 'related' });
    }
  }
  return result;
}
