/**
 * Pages and their revisions. Every change is a new, complete revision; nothing is edited in
 * place, so history, diffs and reverts are trivial and nothing is ever lost.
 */
import { and, asc, desc, eq, gt, isNull, lte, max, ne, or, sql } from 'drizzle-orm';
import { citationStats, normalizeContent } from '@isgratis/types';
import type {
  Language,
  Page,
  PageContent,
  PageListItem,
  PageStatus,
  Revision,
  RevisionSource,
  RevisionSummary,
  SponsoredOffer,
} from '@isgratis/types';
import type { Database } from '../db/client.js';
import { draftJobs, pages, revisions, sponsoredOffers, topics, users, type RevisionRow } from '../db/schema.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { commentCount } from './community.js';
import { clearLinkCache, pageLinks } from './links.js';
import { sourceChecksFor } from './sources.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

function toRevisionSummary(row: RevisionRow, authorName: string | null): RevisionSummary {
  return {
    id: row.id,
    number: row.number,
    editSummary: row.editSummary,
    source: row.source,
    authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function activeOffers(db: Database, lang: Language, slug: string): Promise<SponsoredOffer[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(sponsoredOffers)
    .where(
      and(
        eq(sponsoredOffers.lang, lang),
        eq(sponsoredOffers.slug, slug),
        eq(sponsoredOffers.status, 'active'),
        or(isNull(sponsoredOffers.startsAt), lte(sponsoredOffers.startsAt, now)),
        or(isNull(sponsoredOffers.endsAt), gt(sponsoredOffers.endsAt, now)),
      ),
    )
    .orderBy(asc(sponsoredOffers.createdAt))
    .limit(6);
  return rows.map((row) => ({
    id: row.id,
    advertiserName: row.advertiserName,
    title: row.title,
    description: row.description,
    url: row.url,
    region: row.region,
  }));
}

export async function getPage(db: Database, lang: Language, slug: string): Promise<Page> {
  const [row] = await db
    .select({ page: pages, topicKey: topics.key, revision: revisions, authorName: users.displayName })
    .from(pages)
    .innerJoin(topics, eq(topics.id, pages.topicId))
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .leftJoin(users, eq(users.id, revisions.authorId))
    .where(and(eq(pages.lang, lang), eq(pages.slug, slug)))
    .limit(1);
  if (!row) throw notFound('This page does not exist yet');

  const content = normalizeContent(row.revision.content);
  const urls = [...content.sources.map((source) => source.url), ...content.facts.flatMap((fact) => fact.sourceUrl ?? [])];
  const [translations, offers, checks, comments] = await Promise.all([
    db
      .select({ lang: pages.lang, slug: pages.slug, title: pages.title })
      .from(pages)
      .where(and(eq(pages.topicId, row.page.topicId), ne(pages.id, row.page.id)))
      .orderBy(asc(pages.lang)),
    activeOffers(db, lang, slug),
    sourceChecksFor(db, urls),
    commentCount(db, row.page.id),
  ]);

  return {
    id: row.page.id,
    topicKey: row.topicKey,
    lang: row.page.lang,
    slug: row.page.slug,
    title: row.page.title,
    status: row.page.status,
    content,
    links: await pageLinks(db, lang, slug, content),
    currentRevision: toRevisionSummary(row.revision, row.authorName),
    sponsoredOffers: offers,
    sourceChecks: checks,
    commentCount: comments,
    translations,
    createdAt: row.page.createdAt.toISOString(),
    updatedAt: row.page.updatedAt.toISOString(),
  };
}

export async function listPages(
  db: Database,
  options: { lang?: Language; status?: PageStatus; limit: number; offset: number; sort?: 'updated' | 'title' },
): Promise<PageListItem[]> {
  const conditions = [
    options.lang ? eq(pages.lang, options.lang) : undefined,
    options.status ? eq(pages.status, options.status) : undefined,
  ].filter(Boolean);
  const rows = await db
    .select({ page: pages, content: revisions.content })
    .from(pages)
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(options.sort === 'title' ? asc(pages.title) : desc(pages.updatedAt))
    .limit(options.limit)
    .offset(options.offset);
  return rows.map(({ page, content }) => ({
    lang: page.lang,
    slug: page.slug,
    title: page.title,
    ...(content.emoji ? { emoji: content.emoji } : {}),
    ...(content.plural ? { plural: true } : {}),
    verdict: content.verdict,
    ...(content.scale ? { scale: content.scale } : {}),
    status: page.status,
    summary: content.summary,
    updatedAt: page.updatedAt.toISOString(),
  }));
}

/** Drafts waiting for a person, oldest first, with how well each is sourced. */
export async function reviewQueue(db: Database, lang: Language | undefined, limit: number) {
  const rows = await db
    .select({ page: pages, content: revisions.content })
    .from(pages)
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(and(eq(pages.status, 'draft'), lang ? eq(pages.lang, lang) : undefined))
    .orderBy(asc(pages.createdAt))
    .limit(limit);
  return rows.map(({ page, content }) => {
    const normalized = normalizeContent(content);
    const stats = citationStats(normalized);
    return {
      lang: page.lang,
      slug: page.slug,
      title: page.title,
      ...(normalized.emoji ? { emoji: normalized.emoji } : {}),
      ...(normalized.plural ? { plural: true } : {}),
      verdict: normalized.verdict,
      ...(normalized.scale ? { scale: normalized.scale } : {}),
      status: page.status,
      summary: normalized.summary,
      updatedAt: page.updatedAt.toISOString(),
      createdAt: page.createdAt.toISOString(),
      claims: stats.claims,
      cited: stats.cited,
      sources: normalized.sources.length,
    };
  });
}

/**
 * Deletes a page with its history, talk page and views. Moderators may only delete drafts:
 * a bad LLM draft should not need an admin. The topic goes too when no language uses it.
 */
export async function deletePage(
  db: Database,
  lang: Language,
  slug: string,
  options: { allowPublished: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [page] = await tx
      .select()
      .from(pages)
      .where(and(eq(pages.lang, lang), eq(pages.slug, slug)))
      .for('update')
      .limit(1);
    if (!page) throw notFound('This page does not exist');
    if (page.status === 'published' && !options.allowPublished) {
      throw forbidden();
    }
    await tx.update(pages).set({ currentRevisionId: null }).where(eq(pages.id, page.id));
    await tx.update(draftJobs).set({ pageId: null }).where(eq(draftJobs.pageId, page.id));
    await tx.delete(pages).where(eq(pages.id, page.id));
    await tx.execute(
      sql`delete from topics t where t.id = ${page.topicId} and not exists (select 1 from pages p where p.topic_id = t.id)`,
    );
  });
  clearLinkCache();
}

/** Published pages with their translations, for the sitemap. */
export async function sitemapEntries(db: Database) {
  const rows = await db
    .select({ lang: pages.lang, slug: pages.slug, updatedAt: pages.updatedAt, topicKey: topics.key })
    .from(pages)
    .innerJoin(topics, eq(topics.id, pages.topicId))
    .where(eq(pages.status, 'published'))
    .orderBy(asc(topics.key), asc(pages.lang))
    .limit(50_000);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export interface SaveRevisionInput {
  lang: Language;
  slug: string;
  title: string;
  content: PageContent;
  editSummary: string;
  baseRevisionId: string | null;
  authorId: string | null;
  source: RevisionSource;
  /** English topic key suggested by the LLM; humans creating a page get a private topic. */
  topicKey?: string;
}

async function findOrCreateTopic(tx: Tx, lang: Language, slug: string, suggestedKey?: string): Promise<string> {
  if (suggestedKey) {
    const [existing] = await tx.select().from(topics).where(eq(topics.key, suggestedKey)).limit(1);
    if (existing) {
      const [taken] = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.topicId, existing.id), eq(pages.lang, lang)))
        .limit(1);
      if (!taken) return existing.id;
    } else {
      const [created] = await tx.insert(topics).values({ key: suggestedKey }).onConflictDoNothing().returning();
      if (created) return created.id;
    }
  }
  // A topic of its own. Translations can be linked later by moving the page to another topic.
  const key = `${lang}-${slug}`;
  await tx.insert(topics).values({ key }).onConflictDoNothing();
  const [topic] = await tx.select().from(topics).where(eq(topics.key, key)).limit(1);
  return topic!.id;
}

/**
 * Creates a page or adds a revision to it. A human edit publishes the page: whoever edits an
 * LLM draft has read it. LLM output always lands as a draft.
 */
export async function saveRevision(db: Database, input: SaveRevisionInput): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    const [page] = await tx
      .select()
      .from(pages)
      .where(and(eq(pages.lang, input.lang), eq(pages.slug, input.slug)))
      .for('update')
      .limit(1);
    const status: PageStatus = input.source === 'llm' ? 'draft' : 'published';

    if (!page) {
      if (input.baseRevisionId !== null) {
        throw conflict('page_missing', 'The page you edited no longer exists');
      }
      const topicId = await findOrCreateTopic(tx, input.lang, input.slug, input.topicKey);
      const [createdPage] = await tx
        .insert(pages)
        .values({ topicId, lang: input.lang, slug: input.slug, title: input.title, status })
        .onConflictDoNothing()
        .returning();
      if (!createdPage) throw conflict('page_exists', 'Someone created this page a moment ago');
      const [revision] = await tx
        .insert(revisions)
        .values({
          pageId: createdPage.id,
          number: 1,
          title: input.title,
          content: input.content,
          editSummary: input.editSummary,
          source: input.source,
          authorId: input.authorId,
        })
        .returning();
      await tx.update(pages).set({ currentRevisionId: revision!.id }).where(eq(pages.id, createdPage.id));
      clearLinkCache();
      return { created: true };
    }

    if (page.currentRevisionId !== input.baseRevisionId) {
      throw conflict('edit_conflict', 'The page changed while you were editing. Reload and try again.');
    }
    const [{ last } = { last: 0 }] = await tx
      .select({ last: max(revisions.number) })
      .from(revisions)
      .where(eq(revisions.pageId, page.id));
    const [revision] = await tx
      .insert(revisions)
      .values({
        pageId: page.id,
        number: (last ?? 0) + 1,
        title: input.title,
        content: input.content,
        editSummary: input.editSummary,
        source: input.source,
        authorId: input.authorId,
      })
      .returning();
    await tx
      .update(pages)
      .set({
        title: input.title,
        currentRevisionId: revision!.id,
        updatedAt: sql`now()`,
        status: page.status === 'published' ? 'published' : status,
      })
      .where(eq(pages.id, page.id));
    return { created: false };
  });
}

/** Approves an LLM draft as is. Recorded as a revision so history shows who approved it. */
export async function publishPage(db: Database, lang: Language, slug: string, userId: string): Promise<void> {
  const page = await getPage(db, lang, slug);
  if (page.status === 'published') return;
  await saveRevision(db, {
    lang,
    slug,
    title: page.title,
    content: page.content,
    editSummary: 'Nagekeken en gepubliceerd',
    baseRevisionId: page.currentRevision.id,
    authorId: userId,
    source: 'human',
  });
}

export async function listRevisions(db: Database, lang: Language, slug: string): Promise<RevisionSummary[]> {
  const rows = await db
    .select({ revision: revisions, authorName: users.displayName })
    .from(revisions)
    .innerJoin(pages, eq(pages.id, revisions.pageId))
    .leftJoin(users, eq(users.id, revisions.authorId))
    .where(and(eq(pages.lang, lang), eq(pages.slug, slug)))
    .orderBy(desc(revisions.number))
    .limit(500);
  if (rows.length === 0) throw notFound('This page does not exist yet');
  return rows.map(({ revision, authorName }) => toRevisionSummary(revision, authorName));
}

export async function getRevision(db: Database, lang: Language, slug: string, number: number): Promise<Revision> {
  const [row] = await db
    .select({ revision: revisions, authorName: users.displayName })
    .from(revisions)
    .innerJoin(pages, eq(pages.id, revisions.pageId))
    .leftJoin(users, eq(users.id, revisions.authorId))
    .where(and(eq(pages.lang, lang), eq(pages.slug, slug), eq(revisions.number, number)))
    .limit(1);
  if (!row) throw notFound('Revision not found');
  return {
    ...toRevisionSummary(row.revision, row.authorName),
    title: row.revision.title,
    content: normalizeContent(row.revision.content),
  };
}

export async function revertPage(
  db: Database,
  input: { lang: Language; slug: string; number: number; userId: string; editSummary?: string },
): Promise<void> {
  const [target, page] = await Promise.all([
    getRevision(db, input.lang, input.slug, input.number),
    getPage(db, input.lang, input.slug),
  ]);
  await saveRevision(db, {
    lang: input.lang,
    slug: input.slug,
    title: target.title,
    content: target.content,
    editSummary: input.editSummary?.trim() || `Teruggezet naar versie ${input.number}`,
    baseRevisionId: page.currentRevision.id,
    authorId: input.userId,
    source: 'human',
  });
}

/** All languages a slug exists in, used to resolve subdomains like water.is.gratis. */
export async function languagesForSlug(db: Database, slug: string): Promise<Language[]> {
  const rows = await db.select({ lang: pages.lang }).from(pages).where(eq(pages.slug, slug));
  return rows.map((row) => row.lang);
}

/**
 * Simple search on title and slug, then summary: enough for autocomplete and agents. Exact and
 * prefix matches come first. Swap for Postgres full-text search or pg_trgm when the site grows.
 */
export async function searchPages(db: Database, lang: Language, query: string, limit: number): Promise<PageListItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({ page: pages, content: revisions.content })
    .from(pages)
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(
      and(
        eq(pages.lang, lang),
        or(
          sql`lower(${pages.title}) like ${like}`,
          sql`${pages.slug} like ${like.replace(/ /g, '-')}`,
          sql`lower(${revisions.content}->>'summary') like ${like}`,
        ),
      ),
    )
    .orderBy(
      sql`case when lower(${pages.title}) = ${q} or ${pages.slug} = ${q.replace(/ /g, '-')} then 0
               when lower(${pages.title}) like ${`${q}%`} then 1
               when lower(${pages.title}) like ${like} then 2 else 3 end`,
      sql`case when ${pages.status} = 'published' then 0 else 1 end`,
      asc(pages.title),
    )
    .limit(limit);
  return rows.map(({ page, content }) => ({
    lang: page.lang,
    slug: page.slug,
    title: page.title,
    ...(content.emoji ? { emoji: content.emoji } : {}),
    ...(content.plural ? { plural: true } : {}),
    verdict: content.verdict,
    ...(content.scale ? { scale: content.scale } : {}),
    status: page.status,
    summary: content.summary,
    updatedAt: page.updatedAt.toISOString(),
  }));
}
