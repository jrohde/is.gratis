/**
 * The editorial desk: LLM drafts go past the editorial language model, which publishes them,
 * publishes a corrected version, or leaves them for a person with a note saying why. Sponsored
 * offers go past it too, before the admin approves them.
 */
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Language } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { editorReviews, pages, revisions, sponsoredOffers } from '../db/schema.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { reviewDraft, type EditorVerdict } from '../lib/editor.js';
import { HttpError } from '../lib/errors.js';
import type { LinkCheckResult, PageTextResult } from '../lib/link-check.js';
import type { LlmConfig } from '../lib/llm.js';
import { reviewOffer } from '../lib/offer-editor.js';
import { clearLinkCache } from './links.js';
import { getPage, saveRevision } from './pages.js';
import { clearSuggestionCache } from './search.js';

/** After this many failed attempts on the same revision, the editor leaves it to people. */
export const EDITOR_MAX_ERRORS = 3;

export interface EditorDeps {
  db: Database;
  llm: LlmConfig;
  cache: CacheInvalidator;
  check: (url: string) => Promise<LinkCheckResult>;
  /** Injectable for tests. */
  review?: typeof reviewDraft;
}

/** Drafts whose current revision the editor has not decided on yet, oldest first. */
export async function draftsToReview(
  db: Database,
  limit: number,
): Promise<Array<{ lang: Language; slug: string }>> {
  const result = await db.execute<{ lang: Language; slug: string }>(sql`
    select p.lang, p.slug from pages p
    where p.status = 'draft'
      and not exists (
        select 1 from editor_reviews e where e.revision_id = p.current_revision_id and e.decision <> 'error'
      )
      and (
        select count(*) from editor_reviews e where e.revision_id = p.current_revision_id and e.decision = 'error'
      ) < ${EDITOR_MAX_ERRORS}
    order by p.created_at
    limit ${limit}
  `);
  return result.rows;
}

const SUMMARY: Record<EditorVerdict['decision'], string> = {
  publish: 'Nagekeken en gepubliceerd door de redactie (taalmodel)',
  revise: 'Verbeterd en gepubliceerd door de redactie (taalmodel)',
  reject: '',
};

async function reviewOne(
  deps: EditorDeps,
  lang: Language,
  slug: string,
): Promise<EditorVerdict['decision'] | 'error' | 'skipped'> {
  const page = await getPage(deps.db, lang, slug);
  if (page.status !== 'draft') return 'skipped';
  const record = (decision: EditorVerdict['decision'] | 'error', notes: string) =>
    deps.db
      .insert(editorReviews)
      .values({
        pageId: page.id,
        revisionId: page.currentRevision.id,
        decision,
        notes: notes.slice(0, 1000),
        model: deps.llm.model,
      });

  let verdict: EditorVerdict;
  try {
    const checks = await Promise.all(
      page.content.sources.map(async (source) => ({
        url: source.url,
        ...(await deps.check(source.url)),
      })),
    );
    verdict = await (deps.review ?? reviewDraft)(deps.llm, {
      lang,
      title: page.title,
      content: page.content,
      deadSources: checks.filter((check) => !check.ok).map((check) => check.url),
    });
  } catch (error) {
    await record('error', error instanceof Error ? error.message : String(error));
    return 'error';
  }

  if (verdict.decision !== 'reject') {
    try {
      await saveRevision(deps.db, {
        lang,
        slug,
        title: verdict.decision === 'revise' ? verdict.title : page.title,
        content: verdict.decision === 'revise' ? verdict.content : page.content,
        editSummary: `${SUMMARY[verdict.decision]}: ${verdict.notes}`.slice(0, 300),
        baseRevisionId: page.currentRevision.id,
        authorId: null,
        source: 'editor',
      });
    } catch (error) {
      // A person edited the draft meanwhile: that published it, and their version wins.
      if (error instanceof HttpError && error.code === 'edit_conflict') return 'skipped';
      throw error;
    }
    clearLinkCache();
    clearSuggestionCache();
    await deps.cache.purgePage(lang, slug);
  }
  await record(verdict.decision, verdict.notes);
  return verdict.decision;
}

/** Reviews up to `limit` drafts; returns a one-line account for the bot's log. */
export async function reviewDrafts(deps: EditorDeps, limit: number): Promise<string> {
  const counts = { publish: 0, revise: 0, reject: 0, error: 0, skipped: 0 };
  for (const { lang, slug } of await draftsToReview(deps.db, limit))
    counts[await reviewOne(deps, lang, slug)]++;
  return `${counts.publish} published, ${counts.revise} revised, ${counts.reject} left for people, ${counts.error} failed`;
}

/** The editor's recent decisions, newest first, for the admin screen. */
export async function recentEditorReviews(db: Database, limit: number) {
  const rows = await db
    .select({ review: editorReviews, lang: pages.lang, slug: pages.slug, title: pages.title })
    .from(editorReviews)
    .innerJoin(pages, eq(pages.id, editorReviews.pageId))
    .orderBy(desc(editorReviews.createdAt))
    .limit(limit);
  return rows.map(({ review, lang, slug, title }) => ({
    lang,
    slug,
    title,
    decision: review.decision,
    notes: review.notes,
    createdAt: review.createdAt.toISOString(),
  }));
}

/** After this many failed attempts on an offer, the editor leaves it to the admin. */
export const OFFER_EDITOR_MAX_ATTEMPTS = 3;

export interface OfferEditorDeps {
  db: Database;
  llm: LlmConfig;
  fetchText: (url: string) => Promise<PageTextResult>;
  /** Injectable for tests. */
  review?: typeof reviewOffer;
}

/**
 * Gives advice on sponsor requests that are waiting for the admin: is the offer really free,
 * about the page, honestly worded, and does the landing page say the same?
 */
export async function reviewOffers(deps: OfferEditorDeps, limit: number): Promise<string> {
  const waiting = await deps.db
    .select()
    .from(sponsoredOffers)
    .where(
      and(
        // Running offers too: a report sends an offer back to the editors.
        inArray(sponsoredOffers.status, ['pending', 'active']),
        isNull(sponsoredOffers.editorDecision),
        lt(sponsoredOffers.editorAttempts, OFFER_EDITOR_MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(sponsoredOffers.createdAt))
    .limit(limit);
  const counts = { approve: 0, reject: 0, unsure: 0, error: 0 };
  for (const offer of waiting) {
    try {
      const [page] = await deps.db
        .select({ title: pages.title, summary: sql<string>`${revisions.content}->>'summary'` })
        .from(pages)
        .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
        .where(and(eq(pages.lang, offer.lang), eq(pages.slug, offer.slug)))
        .limit(1);
      const landing = await deps.fetchText(offer.url);
      const verdict = await (deps.review ?? reviewOffer)(deps.llm, {
        lang: offer.lang,
        advertiserName: offer.advertiserName,
        title: offer.title,
        description: offer.description,
        url: offer.url,
        region: offer.region,
        page: page ?? null,
        landingText: landing.ok ? landing.text : null,
        landingError: landing.ok ? null : (landing.error ?? `HTTP ${landing.status ?? '?'}`),
      });
      await deps.db
        .update(sponsoredOffers)
        .set({
          editorDecision: verdict.decision,
          editorNotes: verdict.notes,
          editorSuggestion: verdict.suggestion ?? null,
          editorCheckedAt: new Date(),
        })
        .where(eq(sponsoredOffers.id, offer.id));
      counts[verdict.decision]++;
    } catch (error) {
      await deps.db
        .update(sponsoredOffers)
        .set({
          editorAttempts: sql`${sponsoredOffers.editorAttempts} + 1`,
          editorNotes: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
        })
        .where(eq(sponsoredOffers.id, offer.id));
      counts.error++;
    }
  }
  return `${counts.approve} approved, ${counts.reject} rejected, ${counts.unsure} unsure, ${counts.error} failed`;
}
