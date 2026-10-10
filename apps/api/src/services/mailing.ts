/**
 * Mailing lists: subscribing with confirmation (double opt-in), the weekly mails, and the outbox
 * the bot sends from. Mail is queued here and sent by the bot, so the API never talks to SMTP.
 */
import { and, asc, count, eq, gt, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { claimFor, regionReaches, type Language, type MailingList, type Region } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { mailOutbox, pages, sponsoredOffers, subscriptions, type SubscriptionRow } from '../db/schema.js';
import { newToken } from '../lib/hash.js';
import { MAIL_WORDS, renderMail } from '../lib/mail-text.js';
import type { Mailer } from '../lib/mailer.js';
import { dailyHistory, newThisWeek } from './daily.js';

/** Is an offer for this region of use to a subscriber there? */
export const offerReaches = regionReaches;

/** A mail that keeps failing is given up after this many attempts. */
export const MAIL_MAX_ATTEMPTS = 5;

export async function queueMail(
  db: Database,
  mail: { key: string; to: string; subject: string; text: string; html: string; unsubscribeUrl?: string | null },
): Promise<boolean> {
  const rows = await db
    .insert(mailOutbox)
    .values({ ...mail, unsubscribeUrl: mail.unsubscribeUrl ?? null })
    .onConflictDoNothing({ target: mailOutbox.key })
    .returning({ id: mailOutbox.id });
  return rows.length > 0;
}

/**
 * Starts a subscription, or a change of language or region for an existing one; either waits
 * for confirmation. The answer is the same whatever the state, so the form does not reveal who
 * is subscribed.
 */
export async function subscribe(
  db: Database,
  input: { email: string; list: MailingList; lang: Language; region: Region | null },
  origin: string,
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.email, email), eq(subscriptions.list, input.list)));
  const current = rows.find((row) => row.confirmedAt);
  if (current && current.lang === input.lang && current.region === input.region) return;
  const token = newToken();
  const waiting = rows.find((row) => !row.confirmedAt);
  if (waiting) {
    await db
      .update(subscriptions)
      .set({ lang: input.lang, region: input.region, token, createdAt: new Date() })
      .where(eq(subscriptions.id, waiting.id));
  } else {
    await db.insert(subscriptions).values({ email, list: input.list, lang: input.lang, region: input.region, token });
  }
  const words = MAIL_WORDS[input.lang];
  const body = renderMail({
    lang: input.lang,
    intro: words.confirmBody(words.lists[input.list]),
    sections: [],
    button: { label: words.confirmButton, url: `${origin}/mailing/confirm/${token}` },
    footer: [words.confirmIgnore],
  });
  await queueMail(db, { key: `confirm:${token}`, to: email, subject: words.confirmSubject, ...body });
}

/** Confirms a subscription; it replaces the address's earlier one for that list. Null: unknown link. */
export async function confirmSubscription(db: Database, token: string): Promise<{ list: MailingList; lang: Language } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.token, token)).for('update').limit(1);
    if (!row) return null;
    if (!row.confirmedAt) {
      await tx
        .delete(subscriptions)
        .where(and(eq(subscriptions.email, row.email), eq(subscriptions.list, row.list), ne(subscriptions.id, row.id)));
      await tx.update(subscriptions).set({ confirmedAt: new Date() }).where(eq(subscriptions.id, row.id));
    }
    return { list: row.list, lang: row.lang };
  });
}

/** Unsubscribing deletes the address. Returns false for an unknown link. */
export async function unsubscribe(db: Database, token: string): Promise<boolean> {
  const rows = await db.delete(subscriptions).where(eq(subscriptions.token, token)).returning({ id: subscriptions.id });
  return rows.length > 0;
}

const unsubscribeLink = (origin: string, row: SubscriptionRow) => `${origin}/mailing/unsubscribe/${row.token}`;

/** Offers running now that booked the mailing, in a language. */
async function mailingOffers(db: Database, lang: Language) {
  const now = new Date();
  return db
    .select({ offer: sponsoredOffers, pageTitle: pages.title })
    .from(sponsoredOffers)
    .innerJoin(pages, and(eq(pages.lang, sponsoredOffers.lang), eq(pages.slug, sponsoredOffers.slug)))
    .where(
      and(
        eq(sponsoredOffers.lang, lang),
        eq(sponsoredOffers.status, 'active'),
        // Approved but unpaid offers keep their spot, but nobody sees them yet.
        eq(sponsoredOffers.awaitingPayment, false),
        eq(sponsoredOffers.inMailing, true),
        or(isNull(sponsoredOffers.startsAt), lte(sponsoredOffers.startsAt, now)),
        or(isNull(sponsoredOffers.endsAt), gt(sponsoredOffers.endsAt, now)),
      ),
    )
    .orderBy(asc(sponsoredOffers.createdAt));
}

/** Confirmed subscribers of a list, in pages, so a big list does not sit in memory at once. */
async function* confirmedSubscribers(db: Database, list: MailingList) {
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.list, list), isNotNull(subscriptions.confirmedAt), gt(subscriptions.id, after)))
      .orderBy(asc(subscriptions.id))
      .limit(500);
    if (rows.length === 0) return;
    yield* rows;
    after = rows[rows.length - 1]!.id;
  }
}

/**
 * Queues this week's mail of free offers for every subscriber, with the offers for their region
 * and those valid everywhere. Nobody gets an empty mail. Returns how many mails were queued.
 */
export async function queueOffersMail(db: Database, week: string, origin: string): Promise<number> {
  const offersByLang = new Map<Language, Awaited<ReturnType<typeof mailingOffers>>>();
  let queued = 0;
  for await (const sub of confirmedSubscribers(db, 'offers')) {
    if (!offersByLang.has(sub.lang)) offersByLang.set(sub.lang, await mailingOffers(db, sub.lang));
    const offers = offersByLang.get(sub.lang)!.filter(({ offer }) => offerReaches(offer.region, sub.region));
    if (offers.length === 0) continue;
    const words = MAIL_WORDS[sub.lang];
    const unsubscribeUrl = unsubscribeLink(origin, sub);
    const body = renderMail({
      lang: sub.lang,
      intro: words.offersIntro,
      sections: [
        {
          items: offers.map(({ offer, pageTitle }) => ({
            title: offer.title,
            text: offer.description,
            // Through the click counter, so advertisers see what the mail brought them.
            url: `${origin}/api/offers/${offer.id}/go`,
            note: `${offer.advertiserName}${offer.region ? ` · ${offer.region}` : ''} · ${words.offersOn} ${claimFor(sub.lang, pageTitle)}*`,
          })),
        },
      ],
      footer: [words.why(words.lists.offers)],
      unsubscribeUrl,
    });
    if (await queueMail(db, { key: `offers:${week}:${sub.id}`, to: sub.email, subject: words.offersSubject(offers.length), unsubscribeUrl, ...body })) queued++;
  }
  return queued;
}

/** Queues this week's "free this week" mail: the free thing of each day and the new pages. */
export async function queueWeekMail(db: Database, week: string, origin: string): Promise<number> {
  const contentByLang = new Map<Language, { days: Awaited<ReturnType<typeof dailyHistory>>; fresh: Awaited<ReturnType<typeof newThisWeek>> }>();
  let queued = 0;
  for await (const sub of confirmedSubscribers(db, 'week')) {
    if (!contentByLang.has(sub.lang)) {
      contentByLang.set(sub.lang, { days: await dailyHistory(db, sub.lang, 7), fresh: await newThisWeek(db, sub.lang, 10) });
    }
    const { days, fresh } = contentByLang.get(sub.lang)!;
    if (days.length === 0 && fresh.length === 0) continue;
    const words = MAIL_WORDS[sub.lang];
    const item = (page: (typeof fresh)[number], note?: string) => ({
      title: `${page.emoji ? `${page.emoji} ` : ''}${claimFor(sub.lang, page.title, page.plural)}*`,
      text: page.summary.replace(/\[\^[a-z0-9-]+\]/g, '').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/[*_`>#]/g, ''),
      url: `${origin}/${page.lang}/${page.slug}`,
      ...(note ? { note } : {}),
    });
    const unsubscribeUrl = unsubscribeLink(origin, sub);
    const body = renderMail({
      lang: sub.lang,
      intro: words.weekIntro,
      sections: [
        { items: days.map(({ day, page }) => item(page, day)) },
        ...(fresh.length ? [{ heading: words.weekNew, items: fresh.map((page) => item(page)) }] : []),
      ],
      footer: [words.why(words.lists.week)],
      unsubscribeUrl,
    });
    if (await queueMail(db, { key: `week:${week}:${sub.id}`, to: sub.email, subject: words.weekSubject, unsubscribeUrl, ...body })) queued++;
  }
  return queued;
}

/** Sends up to `limit` queued mails. A row is claimed first, so two bots never send it twice. */
export async function sendQueuedMail(db: Database, mailer: Mailer, limit: number): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(mailOutbox)
        .where(and(eq(mailOutbox.status, 'queued'), lt(mailOutbox.attempts, MAIL_MAX_ATTEMPTS)))
        .orderBy(asc(mailOutbox.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return null;
      await tx.update(mailOutbox).set({ attempts: sql`${mailOutbox.attempts} + 1` }).where(eq(mailOutbox.id, row.id));
      return row;
    });
    if (!claimed) break;
    try {
      await mailer.send(claimed);
      await db.update(mailOutbox).set({ status: 'sent', sentAt: new Date(), error: null }).where(eq(mailOutbox.id, claimed.id));
      sent++;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const giveUp = claimed.attempts + 1 >= MAIL_MAX_ATTEMPTS;
      await db.update(mailOutbox).set({ status: giveUp ? 'failed' : 'queued', error: message }).where(eq(mailOutbox.id, claimed.id));
      failed++;
      // The server is probably down: try the rest later instead of failing them all now.
      break;
    }
  }
  return { sent, failed };
}

/** Housekeeping: unconfirmed subscriptions after a week, sent mail after a month. */
export async function pruneMailing(db: Database): Promise<{ subscriptions: number; mails: number }> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const subs = await db
    .delete(subscriptions)
    .where(and(isNull(subscriptions.confirmedAt), lt(subscriptions.createdAt, weekAgo)))
    .returning({ id: subscriptions.id });
  const mails = await db
    .delete(mailOutbox)
    .where(and(or(eq(mailOutbox.status, 'sent'), eq(mailOutbox.status, 'failed')), lt(mailOutbox.createdAt, monthAgo)))
    .returning({ id: mailOutbox.id });
  return { subscriptions: subs.length, mails: mails.length };
}

/** For the admin: confirmed and waiting subscribers per list and language, and the outbox. */
export async function mailingStats(db: Database) {
  const [lists, outbox] = await Promise.all([
    db
      .select({
        list: subscriptions.list,
        lang: subscriptions.lang,
        confirmed: sql<number>`count(*) filter (where ${subscriptions.confirmedAt} is not null)::int`,
        waiting: sql<number>`count(*) filter (where ${subscriptions.confirmedAt} is null)::int`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.list, subscriptions.lang)
      .orderBy(subscriptions.list, subscriptions.lang),
    db.select({ status: mailOutbox.status, n: count() }).from(mailOutbox).groupBy(mailOutbox.status),
  ]);
  return { lists, outbox: Object.fromEntries(outbox.map((row) => [row.status, row.n])) as Record<string, number> };
}
