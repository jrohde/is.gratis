/**
 * Advertisers have no password. They sign in with a link sent to the address they gave with
 * their requests, and then see every offer made with that address in one portal.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { claimFor, type Language } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { advertiserLogins, advertiserSessions, offerStats, pages, sponsoredOffers } from '../db/schema.js';
import { newToken, sha256 } from '../lib/hash.js';
import { MAIL_WORDS, renderMail } from '../lib/mail-text.js';
import { queueMail } from './mailing.js';

const LOGIN_TTL_MS = 30 * 60 * 1000;
export const ADVERTISER_SESSION_DAYS = 30;
/** At most this many sign-in mails per address per hour, so the form cannot flood an inbox. */
const LOGINS_PER_HOUR = 3;

const normalize = (email: string) => email.trim().toLowerCase();

/**
 * Mails a sign-in link, but only to an address that made a request: the portal would be empty
 * otherwise. The answer is the same either way, so the form does not reveal who advertises.
 */
export async function requestAdvertiserLogin(db: Database, input: { email: string; lang: Language }, origin: string): Promise<void> {
  const email = normalize(input.email);
  const [known] = await db.select({ id: sponsoredOffers.id }).from(sponsoredOffers).where(eq(sponsoredOffers.contactEmail, email)).limit(1);
  if (!known) return;
  const [{ recent } = { recent: 0 }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(advertiserLogins)
    .where(and(eq(advertiserLogins.email, email), gt(advertiserLogins.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (recent >= LOGINS_PER_HOUR) return;

  const token = newToken();
  await db.insert(advertiserLogins).values({ id: sha256(token), email, expiresAt: new Date(Date.now() + LOGIN_TTL_MS) });
  const words = MAIL_WORDS[input.lang];
  const body = renderMail({
    lang: input.lang,
    intro: words.loginBody,
    sections: [],
    button: { label: words.loginButton, url: `${origin}/advertise/login/${token}` },
    footer: [words.loginIgnore],
  });
  await queueMail(db, { key: `advertiser-login:${sha256(token)}`, to: email, subject: words.loginSubject, ...body });
}

/** Trades a sign-in link for a session. Null when the link is unknown, used or expired. */
export async function consumeAdvertiserLogin(db: Database, token: string): Promise<{ token: string; email: string; expiresAt: Date } | null> {
  const [login] = await db
    .update(advertiserLogins)
    .set({ usedAt: new Date() })
    .where(and(eq(advertiserLogins.id, sha256(token)), isNull(advertiserLogins.usedAt), gt(advertiserLogins.expiresAt, new Date())))
    .returning();
  if (!login) return null;
  const session = newToken();
  const expiresAt = new Date(Date.now() + ADVERTISER_SESSION_DAYS * 86_400_000);
  await db.insert(advertiserSessions).values({ id: sha256(session), email: login.email, expiresAt });
  return { token: session, email: login.email, expiresAt };
}

export async function advertiserForSession(db: Database, token: string): Promise<string | null> {
  const [session] = await db
    .select({ email: advertiserSessions.email })
    .from(advertiserSessions)
    .where(and(eq(advertiserSessions.id, sha256(token)), gt(advertiserSessions.expiresAt, new Date())))
    .limit(1);
  return session?.email ?? null;
}

export async function endAdvertiserSession(db: Database, token: string): Promise<void> {
  await db.delete(advertiserSessions).where(eq(advertiserSessions.id, sha256(token)));
}

/** Housekeeping: old sign-in links and expired sessions. */
export async function pruneAdvertiserLogins(db: Database): Promise<void> {
  await db.delete(advertiserLogins).where(lt(advertiserLogins.expiresAt, new Date(Date.now() - 86_400_000)));
  await db.delete(advertiserSessions).where(lt(advertiserSessions.expiresAt, new Date()));
}

/** Every offer requested with this address, newest first, with what an advertiser needs to know. */
export async function advertiserOffers(db: Database, email: string) {
  const rows = await db
    .select({ offer: sponsoredOffers, pageTitle: pages.title })
    .from(sponsoredOffers)
    .leftJoin(pages, and(eq(pages.lang, sponsoredOffers.lang), eq(pages.slug, sponsoredOffers.slug)))
    .where(eq(sponsoredOffers.contactEmail, normalize(email)))
    .orderBy(desc(sponsoredOffers.createdAt))
    .limit(200);
  const ids = rows.map((row) => row.offer.id);
  const totals = ids.length
    ? await db
        .select({
          offerId: offerStats.offerId,
          impressions: sql<number>`sum(${offerStats.impressions})::int`,
          clicks: sql<number>`sum(${offerStats.clicks})::int`,
        })
        .from(offerStats)
        .where(inArray(offerStats.offerId, ids))
        .groupBy(offerStats.offerId)
        .orderBy(asc(offerStats.offerId))
    : [];
  const byId = new Map(totals.map((row) => [row.offerId, row]));
  return rows.map(({ offer, pageTitle }) => ({
    id: offer.id,
    statsToken: offer.statsToken ?? '',
    lang: offer.lang,
    slug: offer.slug,
    claim: pageTitle ? `${claimFor(offer.lang, pageTitle)}*` : `/${offer.lang}/${offer.slug}`,
    title: offer.title,
    description: offer.description,
    url: offer.url,
    region: offer.region,
    status: offer.status,
    priceCents: offer.priceCents,
    inMailing: offer.inMailing,
    mailingPriceCents: offer.mailingPriceCents,
    startsAt: offer.startsAt?.toISOString() ?? null,
    endsAt: offer.endsAt?.toISOString() ?? null,
    createdAt: offer.createdAt.toISOString(),
    // What the editors found is shared with the advertiser: no decision without a reason.
    editor: offer.editorDecision
      ? { decision: offer.editorDecision, notes: offer.editorNotes ?? '', ...(offer.editorSuggestion ? { suggestion: offer.editorSuggestion } : {}) }
      : null,
    impressions: byId.get(offer.id)?.impressions ?? 0,
    clicks: byId.get(offer.id)?.clicks ?? 0,
  }));
}

/** After a request: a mail with the secret link, so it is never lost with a closed tab. */
export async function mailRequestReceived(
  db: Database,
  offer: { id: string; lang: Language; slug: string; title: string; contactEmail: string; statsToken: string },
  origin: string,
): Promise<void> {
  const words = MAIL_WORDS[offer.lang];
  const body = renderMail({
    lang: offer.lang,
    intro: `${words.requestBody(offer.title, `${origin}/${offer.lang}/${offer.slug}`)} ${words.requestSteps}`,
    sections: [],
    button: { label: words.requestButton, url: `${origin}/advertise/stats/${offer.statsToken}?lang=${offer.lang}` },
    footer: [words.advertiserWhy],
  });
  await queueMail(db, { key: `request-received:${offer.id}`, to: offer.contactEmail, subject: words.requestSubject(offer.title), ...body });
}
