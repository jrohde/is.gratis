/**
 * Sponsored offers: advertisers request a spot on a page, an admin approves it, and the offer
 * is shown in the clearly labelled "free here" block for the booked period.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Language, Region, SponsorBooking, SponsorRequestStatus } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { offerStats, pages, revisions, sponsoredOffers, type SponsoredOfferRow } from '../db/schema.js';
import { newToken } from '../lib/hash.js';
import { conflict, notFound } from '../lib/errors.js';

export function toBooking(row: SponsoredOfferRow): SponsorBooking {
  return {
    id: row.id,
    lang: row.lang,
    slug: row.slug,
    region: row.region,
    advertiserName: row.advertiserName,
    contactEmail: row.contactEmail,
    title: row.title,
    description: row.description,
    url: row.url,
    message: row.message,
    status: row.status,
    priceCents: row.priceCents,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    editor:
      row.editorDecision && row.editorCheckedAt
        ? {
            decision: row.editorDecision,
            notes: row.editorNotes ?? '',
            ...(row.editorSuggestion ? { suggestion: row.editorSuggestion } : {}),
            checkedAt: row.editorCheckedAt.toISOString(),
          }
        : null,
  };
}

export async function createSponsorRequest(
  db: Database,
  input: {
    lang: Language;
    slug: string;
    region: Region | null;
    advertiserName: string;
    contactEmail: string;
    title: string;
    description: string;
    url: string;
    message?: string;
    priceCents: number;
  },
): Promise<SponsorBooking & { statsToken: string }> {
  const [row] = await db
    .insert(sponsoredOffers)
    .values({
      ...input,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      message: input.message ?? null,
      statsToken: newToken(),
    })
    .returning();
  return { ...toBooking(row!), statsToken: row!.statsToken! };
}

export async function listBookings(db: Database, status?: SponsorRequestStatus): Promise<SponsorBooking[]> {
  const rows = await db
    .select()
    .from(sponsoredOffers)
    .where(status ? eq(sponsoredOffers.status, status) : undefined)
    .orderBy(desc(sponsoredOffers.createdAt))
    .limit(500);
  return rows.map(toBooking);
}

export async function reviewBooking(
  db: Database,
  id: string,
  input: {
    status: SponsorRequestStatus;
    startsAt: Date | null;
    endsAt: Date | null;
    reviewerId: string;
    /** Take over the editor's neutral rewording of title and description. */
    applySuggestion?: boolean;
    /** Activate although the editorial language model did not approve. */
    override?: boolean;
    editorRequired?: boolean;
  },
): Promise<SponsorBooking> {
  const [current] = await db.select().from(sponsoredOffers).where(eq(sponsoredOffers.id, id)).limit(1);
  if (!current) throw notFound('Booking not found');
  if (input.status === 'active' && input.editorRequired && current.editorDecision !== 'approve' && !input.override) {
    throw conflict('editor_not_approved', 'The editorial check did not approve this offer');
  }
  const suggestion = input.applySuggestion ? current.editorSuggestion : null;
  const [row] = await db
    .update(sponsoredOffers)
    .set({
      ...(suggestion?.title ? { title: suggestion.title } : {}),
      ...(suggestion?.description ? { description: suggestion.description } : {}),
      status: input.status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
    })
    .where(eq(sponsoredOffers.id, id))
    .returning();
  if (!row) throw notFound('Booking not found');
  return toBooking(row);
}

/** Every running offer in a language with the page it belongs to: the "free right now" overview. */
export async function activeOffersOverview(db: Database, lang: Language) {
  const now = new Date();
  const rows = await db
    .select({ offer: sponsoredOffers, title: pages.title, content: revisions.content })
    .from(sponsoredOffers)
    .innerJoin(pages, and(eq(pages.lang, sponsoredOffers.lang), eq(pages.slug, sponsoredOffers.slug)))
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(
      and(
        eq(sponsoredOffers.lang, lang),
        eq(sponsoredOffers.status, 'active'),
        or(isNull(sponsoredOffers.startsAt), lte(sponsoredOffers.startsAt, now)),
        or(isNull(sponsoredOffers.endsAt), gt(sponsoredOffers.endsAt, now)),
      ),
    )
    .orderBy(desc(sponsoredOffers.startsAt), desc(sponsoredOffers.createdAt))
    .limit(200);
  return rows.map(({ offer, title, content }) => ({
    id: offer.id,
    advertiserName: offer.advertiserName,
    title: offer.title,
    description: offer.description,
    url: offer.url,
    region: offer.region,
    page: { lang: offer.lang, slug: offer.slug, title, ...(content.plural ? { plural: true } : {}), ...(content.emoji ? { emoji: content.emoji } : {}) },
  }));
}

const activeNow = () => {
  const now = new Date();
  return and(
    eq(sponsoredOffers.status, 'active'),
    or(isNull(sponsoredOffers.startsAt), lte(sponsoredOffers.startsAt, now)),
    or(isNull(sponsoredOffers.endsAt), gt(sponsoredOffers.endsAt, now)),
  );
};

/** Counts that offers were shown. Unknown or ended offers are ignored. */
export async function recordImpressions(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const live = await db.select({ id: sponsoredOffers.id }).from(sponsoredOffers).where(and(inArray(sponsoredOffers.id, ids), activeNow()));
  for (const { id } of live) {
    await db.execute(sql`
      insert into offer_stats (offer_id, day, impressions) values (${id}, current_date, 1)
      on conflict (offer_id, day) do update set impressions = offer_stats.impressions + 1
    `);
  }
}

/** Counts a click and returns where to send the visitor, or null when the offer is not running. */
export async function clickOffer(db: Database, id: string): Promise<string | null> {
  const [offer] = await db.select({ url: sponsoredOffers.url }).from(sponsoredOffers).where(and(eq(sponsoredOffers.id, id), activeNow())).limit(1);
  if (!offer) return null;
  await db.execute(sql`
    insert into offer_stats (offer_id, day, clicks) values (${id}, current_date, 1)
    on conflict (offer_id, day) do update set clicks = offer_stats.clicks + 1
  `);
  return offer.url;
}

/** What an advertiser sees behind their secret link: their offer and its daily numbers. */
export async function statsForToken(db: Database, token: string) {
  const [offer] = await db.select().from(sponsoredOffers).where(eq(sponsoredOffers.statsToken, token)).limit(1);
  if (!offer) throw notFound('Unknown link');
  const days = await db
    .select({ day: offerStats.day, impressions: offerStats.impressions, clicks: offerStats.clicks })
    .from(offerStats)
    .where(and(eq(offerStats.offerId, offer.id), gt(offerStats.day, sql`current_date - 90`)))
    .orderBy(asc(offerStats.day));
  const totals = days.reduce(
    (sum, d) => ({ impressions: sum.impressions + d.impressions, clicks: sum.clicks + d.clicks }),
    { impressions: 0, clicks: 0 },
  );
  return {
    offer: {
      lang: offer.lang,
      slug: offer.slug,
      title: offer.title,
      advertiserName: offer.advertiserName,
      status: offer.status,
      priceCents: offer.priceCents,
      startsAt: offer.startsAt?.toISOString() ?? null,
      endsAt: offer.endsAt?.toISOString() ?? null,
    },
    days,
    totals,
  };
}

/**
 * Asks again for the same offer, from the advertiser's secret link: on the same page (renewal) or
 * on another page (an upgrade to a busier one). A new pending request with its own link and the
 * price of today; an admin reviews it like any other.
 */
export async function renewFromToken(
  db: Database,
  token: string,
  input: { slug?: string; priceCents: (lang: Language, slug: string) => Promise<number> },
): Promise<{ statsToken: string; priceCents: number; slug: string }> {
  const [offer] = await db.select().from(sponsoredOffers).where(eq(sponsoredOffers.statsToken, token)).limit(1);
  if (!offer) throw notFound('Unknown link');
  const slug = input.slug ?? offer.slug;
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.lang, offer.lang), eq(pages.slug, slug), eq(pages.status, 'published')))
    .limit(1);
  if (!page) throw notFound('This page does not exist');
  const priceCents = await input.priceCents(offer.lang, slug);
  const [row] = await db
    .insert(sponsoredOffers)
    .values({
      lang: offer.lang,
      slug,
      region: offer.region,
      advertiserName: offer.advertiserName,
      contactEmail: offer.contactEmail,
      title: offer.title,
      description: offer.description,
      url: offer.url,
      message: slug === offer.slug ? `Verlenging van ${offer.id}` : `Opwaardering van ${offer.id} (/${offer.lang}/${offer.slug})`,
      priceCents,
      statsToken: newToken(),
    })
    .returning();
  return { statsToken: row!.statsToken!, priceCents, slug };
}
