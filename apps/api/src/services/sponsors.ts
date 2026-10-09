/**
 * Sponsored offers: advertisers request a spot on a page, an admin approves it, and the offer
 * is shown in the clearly labelled "free here" block for the booked period.
 */
import { desc, eq } from 'drizzle-orm';
import type { Language, Region, SponsorBooking, SponsorRequestStatus } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { sponsoredOffers, type SponsoredOfferRow } from '../db/schema.js';
import { notFound } from '../lib/errors.js';

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
): Promise<SponsorBooking> {
  const [row] = await db
    .insert(sponsoredOffers)
    .values({ ...input, contactEmail: input.contactEmail.trim().toLowerCase(), message: input.message ?? null })
    .returning();
  return toBooking(row!);
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
  input: { status: SponsorRequestStatus; startsAt: Date | null; endsAt: Date | null; reviewerId: string },
): Promise<SponsorBooking> {
  const [row] = await db
    .update(sponsoredOffers)
    .set({
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
