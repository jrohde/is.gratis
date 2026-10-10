/** Reports from readers about a page or a sponsored offer on it, handled by moderators. */
import { and, count, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Language, Report, ReportReason } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { pages, reports, sponsoredOffers } from '../db/schema.js';
import { notFound, tooManyRequests } from '../lib/errors.js';

export async function createReport(
  db: Database,
  input: { lang: Language; slug: string; reason: ReportReason; message?: string; ipHash: string; userId: string | null },
  perHour: number,
): Promise<string> {
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.lang, input.lang), eq(pages.slug, input.slug)))
    .limit(1);
  if (!page) throw notFound('This page does not exist');
  const [recent] = await db
    .select({ n: count() })
    .from(reports)
    .where(and(eq(reports.ipHash, input.ipHash), gt(reports.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if ((recent?.n ?? 0) >= perHour) throw tooManyRequests('You sent several reports already. Try again in an hour.');
  const [row] = await db
    .insert(reports)
    .values({ pageId: page.id, reason: input.reason, message: input.message?.trim() || null, ipHash: input.ipHash, userId: input.userId })
    .returning({ id: reports.id });
  return row!.id;
}

/**
 * Reports a sponsored offer. The editorial language model looks at it again (it reads the
 * landing page anew), so the moderator finds fresh advice next to the report.
 */
export async function createOfferReport(
  db: Database,
  input: { offerId: string; reason: ReportReason; message?: string; ipHash: string; userId: string | null },
  perHour: number,
): Promise<string> {
  const [offer] = await db
    .select({ id: sponsoredOffers.id, pageId: pages.id })
    .from(sponsoredOffers)
    .innerJoin(pages, and(eq(pages.lang, sponsoredOffers.lang), eq(pages.slug, sponsoredOffers.slug)))
    .where(and(eq(sponsoredOffers.id, input.offerId), inArray(sponsoredOffers.status, ['active', 'pending'])))
    .limit(1);
  if (!offer) throw notFound('This offer is not running');
  const [recent] = await db
    .select({ n: count() })
    .from(reports)
    .where(and(eq(reports.ipHash, input.ipHash), gt(reports.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if ((recent?.n ?? 0) >= perHour) throw tooManyRequests('You sent several reports already. Try again in an hour.');
  const [row] = await db
    .insert(reports)
    .values({
      pageId: offer.pageId,
      offerId: offer.id,
      reason: input.reason,
      message: input.message?.trim() || null,
      ipHash: input.ipHash,
      userId: input.userId,
    })
    .returning({ id: reports.id });
  // At most one fresh look a day: reports are free to send, a language model is not.
  await db
    .update(sponsoredOffers)
    .set({ editorDecision: null, editorNotes: null, editorSuggestion: null, editorCheckedAt: null, editorAttempts: 0 })
    .where(
      and(
        eq(sponsoredOffers.id, offer.id),
        or(isNull(sponsoredOffers.editorCheckedAt), lt(sponsoredOffers.editorCheckedAt, new Date(Date.now() - 86_400_000))),
      ),
    );
  return row!.id;
}

export async function listReports(db: Database, status: 'open' | 'resolved'): Promise<Report[]> {
  const rows = await db
    .select({
      report: reports,
      lang: pages.lang,
      slug: pages.slug,
      title: pages.title,
      offerTitle: sponsoredOffers.title,
      advertiserName: sponsoredOffers.advertiserName,
    })
    .from(reports)
    .innerJoin(pages, eq(pages.id, reports.pageId))
    .leftJoin(sponsoredOffers, eq(sponsoredOffers.id, reports.offerId))
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(200);
  return rows.map(({ report, lang, slug, title, offerTitle, advertiserName }) => ({
    id: report.id,
    lang,
    slug,
    title,
    reason: report.reason,
    message: report.message,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    ...(report.offerId && offerTitle ? { offer: { id: report.offerId, title: offerTitle, advertiserName: advertiserName ?? '' } } : {}),
  }));
}

export async function resolveReport(db: Database, id: string, userId: string): Promise<void> {
  const [row] = await db
    .update(reports)
    .set({ status: 'resolved', resolvedBy: userId, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning({ id: reports.id });
  if (!row) throw notFound('Report not found');
}
