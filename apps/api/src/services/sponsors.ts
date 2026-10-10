/**
 * Sponsored offers: advertisers request a spot on a page, an admin approves it, and the offer
 * is shown in the clearly labelled "free here" block for the booked period.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { OFFER_SLOTS, regionsOverlap, type Language, type Region, type SponsorBooking, type SponsorRequestStatus } from '@isgratis/types';
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
    exclusive: row.exclusive,
    awaitingPayment: row.awaitingPayment,
    inMailing: row.inMailing,
    mailingPriceCents: row.mailingPriceCents,
  };
}

/** The monthly price of having a page to yourself, rounded to whole euros. */
export function exclusivePrice(priceCents: number, percent: number): number {
  return Math.ceil((priceCents * percent) / 100 / 100) * 100;
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
    inMailing?: boolean;
    mailingPriceCents?: number | null;
    exclusive?: boolean;
    billingAddress?: string;
    billingCountry?: string;
    vatNumber?: string;
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

export async function bookingById(db: Database, id: string): Promise<SponsorBooking> {
  const [row] = await db.select().from(sponsoredOffers).where(eq(sponsoredOffers.id, id)).limit(1);
  if (!row) throw notFound('Booking not found');
  return toBooking(row);
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

/**
 * Who else a new offer for this region and period would share its readers with: running offers
 * on the same page for overlapping regions at overlapping times. A null start means now, a null
 * end never. The advertiser is recognised by e-mail address or name.
 */
export async function pageAvailability(
  db: Database,
  input: {
    lang: Language;
    slug: string;
    region: Region | null;
    startsAt: Date | null;
    endsAt: Date | null;
    excludeId?: string;
    advertiser?: { email: string; name: string };
  },
): Promise<{ taken: number; exclusive: boolean; sameAdvertiser: boolean }> {
  const start = input.startsAt ?? new Date();
  const rows = await db
    .select({
      id: sponsoredOffers.id,
      region: sponsoredOffers.region,
      startsAt: sponsoredOffers.startsAt,
      exclusive: sponsoredOffers.exclusive,
      email: sponsoredOffers.contactEmail,
      name: sponsoredOffers.advertiserName,
    })
    .from(sponsoredOffers)
    .where(
      and(
        eq(sponsoredOffers.lang, input.lang),
        eq(sponsoredOffers.slug, input.slug),
        eq(sponsoredOffers.status, 'active'),
        or(isNull(sponsoredOffers.endsAt), gt(sponsoredOffers.endsAt, start)),
      ),
    );
  const competing = rows.filter(
    (row) =>
      row.id !== input.excludeId &&
      (!input.endsAt || !row.startsAt || row.startsAt < input.endsAt) &&
      regionsOverlap(row.region, input.region),
  );
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return {
    taken: competing.length,
    exclusive: competing.some((row) => row.exclusive),
    sameAdvertiser: input.advertiser
      ? competing.some((row) => same(row.email, input.advertiser!.email) || same(row.name, input.advertiser!.name))
      : false,
  };
}

/** Spots still free on a page right now for readers in a region, and whether it can be had alone. */
export async function slotsFree(db: Database, lang: Language, slug: string, region: Region | null): Promise<{ free: number; exclusiveAvailable: boolean }> {
  const { taken, exclusive } = await pageAvailability(db, { lang, slug, region, startsAt: null, endsAt: null });
  return { free: exclusive ? 0 : Math.max(0, OFFER_SLOTS - taken), exclusiveAvailable: taken === 0 };
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
  if (input.status === 'active') {
    const page = await pageAvailability(db, {
      lang: current.lang,
      slug: current.slug,
      region: current.region,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      excludeId: current.id,
      advertiser: { email: current.contactEmail, name: current.advertiserName },
    });
    // Each refusal protects someone: the advertiser from paying for a spot readers never see,
    // the others from one party taking every spot, and an exclusive booking from company.
    if (current.exclusive && page.taken > 0) {
      throw conflict('page_taken', 'An exclusive offer needs the page to itself, and other offers run in this period.');
    }
    if (page.exclusive) throw conflict('page_exclusive', 'Another offer has this page to itself in this period.');
    if (page.taken >= OFFER_SLOTS) {
      throw conflict('page_full', `This page already has ${OFFER_SLOTS} offers for these readers in this period. Choose a later start.`);
    }
    if (page.sameAdvertiser) {
      throw conflict('one_per_advertiser', 'This advertiser already has an offer for these readers on this page in this period.');
    }
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
        // Approved but unpaid offers keep their spot, but nobody sees them yet.
        eq(sponsoredOffers.awaitingPayment, false),
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
    // Approved but unpaid offers keep their spot, but nobody sees them yet.
    eq(sponsoredOffers.awaitingPayment, false),
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
  input: {
    slug?: string;
    priceCents: (lang: Language, slug: string) => Promise<number>;
    mailingPriceCents: number;
    /** An exclusive booking stays exclusive, at this percentage of today's price. */
    exclusivePercent: number;
  },
): Promise<{ statsToken: string; priceCents: number; slug: string; id: string; lang: Language; title: string; contactEmail: string }> {
  const [offer] = await db.select().from(sponsoredOffers).where(eq(sponsoredOffers.statsToken, token)).limit(1);
  if (!offer) throw notFound('Unknown link');
  const slug = input.slug ?? offer.slug;
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.lang, offer.lang), eq(pages.slug, slug), eq(pages.status, 'published')))
    .limit(1);
  if (!page) throw notFound('This page does not exist');
  const pagePrice = await input.priceCents(offer.lang, slug);
  const priceCents = offer.exclusive ? exclusivePrice(pagePrice, input.exclusivePercent) : pagePrice;
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
      billingAddress: offer.billingAddress,
      billingCountry: offer.billingCountry,
      vatNumber: offer.vatNumber,
      // The extras carry over, at today's prices.
      exclusive: offer.exclusive,
      inMailing: offer.inMailing,
      mailingPriceCents: offer.inMailing ? input.mailingPriceCents : null,
      statsToken: newToken(),
    })
    .returning();
  return { statsToken: row!.statsToken!, priceCents, slug, id: row!.id, lang: row!.lang, title: row!.title, contactEmail: row!.contactEmail };
}
