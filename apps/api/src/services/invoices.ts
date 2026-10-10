/**
 * Invoicing for sponsored offers: an invoice when an offer is approved, payment online through
 * Mollie or by bank transfer, bank statements matched to invoices, and reminders.
 *
 * New advertisers pay in advance: their offer waits until the invoice is paid. Advertisers who
 * paid before go live right away and pay within the payment term.
 */
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { claimFor, type Language } from '@isgratis/types';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { invoiceCounters, invoices, offerStats, pages, sponsoredOffers, type InvoiceLine, type InvoiceRow } from '../db/schema.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { conflict, notFound } from '../lib/errors.js';
import { newToken } from '../lib/hash.js';
import { money } from '../lib/invoice-pdf.js';
import { MAIL_WORDS, renderMail } from '../lib/mail-text.js';
import { createPayment, getPayment, MollieError } from '../lib/mollie.js';
import { vatFor, vatOn } from '../lib/vat.js';
import { queueMail } from './mailing.js';

export interface BillingDeps {
  db: Database;
  billing: Config['billing'];
  origin: string;
  cache: CacheInvalidator;
  /** Injectable for tests. */
  mollieFetch?: typeof fetch;
}

const LOCALES: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', es: 'es-ES' };
const day = (date: Date, lang: Language) =>
  new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(date);

/** Whole months in a period, at least one: what a monthly price is multiplied by. */
export function monthsIn(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.44 * 86_400_000)));
}

/** The next number of the year, without gaps: IG2026-0001, IG2026-0002, ... */
async function nextNumber(db: Database, year: number, prefix: string): Promise<string> {
  const [row] = await db
    .insert(invoiceCounters)
    .values({ year, last: 1 })
    .onConflictDoUpdate({ target: invoiceCounters.year, set: { last: sql`${invoiceCounters.last} + 1` } })
    .returning();
  return `${prefix}${year}-${String(row!.last).padStart(4, '0')}`;
}

/** Has this address paid an invoice before? Then it may go live before paying. */
export async function hasPaidBefore(db: Database, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.customerEmail, email.trim().toLowerCase()), eq(invoices.status, 'paid')))
    .limit(1);
  return Boolean(row);
}

const invoiceLink = (origin: string, invoice: Pick<InvoiceRow, 'token' | 'lang'>) =>
  `${origin}/advertise/invoice/${invoice.token}?lang=${invoice.lang}`;

/** The invoice for an approved offer: its booked period at the monthly price, plus the mailing. */
export async function invoiceOffer(deps: BillingDeps, offerId: string): Promise<InvoiceRow> {
  const [row] = await deps.db
    .select({ offer: sponsoredOffers, pageTitle: pages.title })
    .from(sponsoredOffers)
    .leftJoin(pages, and(eq(pages.lang, sponsoredOffers.lang), eq(pages.slug, sponsoredOffers.slug)))
    .where(eq(sponsoredOffers.id, offerId))
    .limit(1);
  if (!row) throw notFound('Offer not found');
  const { offer } = row;
  const lang = offer.lang;
  const start = offer.startsAt ?? new Date();
  const end = offer.endsAt ?? new Date(start.getTime() + 30 * 86_400_000);
  const months = monthsIn(start, end);
  const what = `${row.pageTitle ? `${claimFor(lang, row.pageTitle)}*` : `/${lang}/${offer.slug}`} (/${lang}/${offer.slug})`;
  const period = `${day(start, lang)} – ${day(end, lang)}`;
  const LINE = {
    nl: { spot: 'Gesponsorde plek', exclusive: 'exclusief', months: 'maand(en)', mailing: 'Wekelijkse mail met gratis aanbiedingen' },
    en: { spot: 'Sponsored spot', exclusive: 'exclusive', months: 'month(s)', mailing: 'Weekly mail of free offers' },
    de: { spot: 'Gesponserter Platz', exclusive: 'exklusiv', months: 'Monat(e)', mailing: 'Wöchentliche Mail mit kostenlosen Angeboten' },
    es: { spot: 'Espacio patrocinado', exclusive: 'exclusivo', months: 'mes(es)', mailing: 'Correo semanal de ofertas gratis' },
  }[lang];
  const lines: InvoiceLine[] = [
    {
      description: `${LINE.spot}${offer.exclusive ? ` (${LINE.exclusive})` : ''}: “${offer.title}” — ${what}, ${period}, ${months} ${LINE.months} × ${money(offer.priceCents ?? 0, lang)}`,
      amountCents: (offer.priceCents ?? 0) * months,
    },
    ...(offer.inMailing && offer.mailingPriceCents
      ? [{ description: `${LINE.mailing}, ${months} ${LINE.months} × ${money(offer.mailingPriceCents, lang)}`, amountCents: offer.mailingPriceCents * months }]
      : []),
  ];
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const vat = vatFor({ country: offer.billingCountry, vatNumber: offer.vatNumber, lang }, deps.billing.vatRateBps);
  const vatCents = vatOn(subtotalCents, vat.rateBps);
  const issuedAt = new Date();

  const [invoice] = await deps.db
    .insert(invoices)
    .values({
      number: await nextNumber(deps.db, issuedAt.getUTCFullYear(), deps.billing.invoicePrefix),
      token: newToken(),
      offerId: offer.id,
      lang,
      customerName: offer.advertiserName,
      customerEmail: offer.contactEmail,
      customerAddress: offer.billingAddress,
      customerCountry: offer.billingCountry,
      customerVatNumber: offer.vatNumber,
      lines,
      subtotalCents,
      vatRateBps: vat.rateBps,
      vatNote: vat.note,
      vatCents,
      totalCents: subtotalCents + vatCents,
      issuedAt,
      dueAt: new Date(issuedAt.getTime() + deps.billing.dueDays * 86_400_000),
    })
    .returning();

  const words = MAIL_WORDS[lang];
  const body = renderMail({
    lang,
    intro: `${words.invoiceBody(money(invoice!.totalCents, lang), day(invoice!.dueAt, lang), what)}${offer.awaitingPayment ? ` ${words.invoiceUnpaidNote}` : ''}`,
    sections: [],
    button: { label: words.invoiceButton, url: invoiceLink(deps.origin, invoice!) },
    footer: [words.advertiserWhy],
  });
  await queueMail(deps.db, { key: `invoice:${invoice!.id}`, to: offer.contactEmail, subject: words.invoiceSubject(invoice!.number), ...body });
  return invoice!;
}

export async function invoiceByToken(db: Database, token: string): Promise<InvoiceRow> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.token, token)).limit(1);
  if (!invoice) throw notFound('Unknown invoice link');
  return invoice;
}

/** Marks an invoice paid once, puts a waiting offer live, and thanks the advertiser. */
export async function markPaid(deps: BillingDeps, invoiceId: string, via: 'mollie' | 'transfer' | 'manual'): Promise<boolean> {
  const [invoice] = await deps.db
    .update(invoices)
    .set({ status: 'paid', paidAt: new Date(), paidVia: via })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'open')))
    .returning();
  if (!invoice) return false;
  if (invoice.offerId) {
    const [offer] = await deps.db
      .update(sponsoredOffers)
      .set({ awaitingPayment: false })
      .where(eq(sponsoredOffers.id, invoice.offerId))
      .returning({ lang: sponsoredOffers.lang, slug: sponsoredOffers.slug });
    if (offer) await deps.cache.purgePage(offer.lang, offer.slug);
  }
  const words = MAIL_WORDS[invoice.lang];
  const body = renderMail({
    lang: invoice.lang,
    intro: words.paidBody(invoice.number),
    sections: [],
    button: { label: words.invoiceButton, url: invoiceLink(deps.origin, invoice) },
    footer: [words.advertiserWhy],
  });
  await queueMail(deps.db, { key: `paid:${invoice.id}`, to: invoice.customerEmail, subject: words.paidSubject(invoice.number), ...body });
  return true;
}

/** An invoice is never deleted; a wrong one is voided and, if needed, replaced by a new one. */
export async function voidInvoice(db: Database, invoiceId: string): Promise<void> {
  const rows = await db
    .update(invoices)
    .set({ status: 'void' })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'open')))
    .returning({ id: invoices.id });
  if (rows.length === 0) throw conflict('not_open', 'Only an open invoice can be voided');
}

/** Starts an online payment for an invoice and returns where to send the payer. */
export async function startPayment(deps: BillingDeps, token: string): Promise<string> {
  if (!deps.billing.mollieApiKey) throw conflict('no_online_payment', 'Online payment is not available; please pay by bank transfer.');
  const invoice = await invoiceByToken(deps.db, token);
  if (invoice.status !== 'open') throw conflict('not_open', 'This invoice is not open');
  const locale = { nl: 'nl_NL', en: 'en_GB', de: 'de_DE', es: 'es_ES' }[invoice.lang];
  const payment = await createPayment(
    { apiKey: deps.billing.mollieApiKey, ...(deps.mollieFetch ? { fetch: deps.mollieFetch } : {}) },
    {
      amountCents: invoice.totalCents,
      description: `is.gratis ${invoice.number}`,
      redirectUrl: `${invoiceLink(deps.origin, invoice)}&returned=1`,
      webhookUrl: `${deps.origin}/api/payments/mollie/webhook`,
      invoiceId: invoice.id,
      locale,
    },
  );
  await deps.db.update(invoices).set({ molliePaymentId: payment.id }).where(eq(invoices.id, invoice.id));
  return payment.checkoutUrl;
}

/** Mollie says a payment changed. We ask Mollie itself what happened, and only then act. */
export async function handleMollieWebhook(deps: BillingDeps, paymentId: string): Promise<void> {
  if (!deps.billing.mollieApiKey) return;
  let payment;
  try {
    payment = await getPayment({ apiKey: deps.billing.mollieApiKey, ...(deps.mollieFetch ? { fetch: deps.mollieFetch } : {}) }, paymentId);
  } catch (error) {
    // Unknown ids are ignored; other failures make Mollie try again later.
    if (error instanceof MollieError && /HTTP 404/.test(error.message)) return;
    throw error;
  }
  if (payment.status !== 'paid' || !payment.invoiceId) return;
  const [invoice] = await deps.db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1);
  if (!invoice || payment.amountCents < invoice.totalCents) return;
  await markPaid(deps, invoice.id, 'mollie');
}

export interface StatementCredit {
  amountCents: number;
  text: string;
}

const stripTags = (xml: string) =>
  xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Incoming payments from a bank statement: CAMT.053 (XML) or MT940, the two formats ABN AMRO
 * and most banks export. Only credits are kept: money that came in.
 */
export function parseStatement(content: string): StatementCredit[] {
  if (content.trimStart().startsWith('<')) {
    const credits: StatementCredit[] = [];
    for (const entry of content.match(/<(?:\w+:)?Ntry>[\s\S]*?<\/(?:\w+:)?Ntry>/g) ?? []) {
      if (!/<(?:\w+:)?CdtDbtInd>\s*CRDT\s*</.test(entry)) continue;
      const amount = entry.match(/<(?:\w+:)?Amt[^>]*>\s*([\d.]+)\s*</);
      if (!amount) continue;
      const texts = [
        ...(entry.match(/<(?:\w+:)?RmtInf>[\s\S]*?<\/(?:\w+:)?RmtInf>/g) ?? []),
        ...(entry.match(/<(?:\w+:)?AddtlNtryInf>[\s\S]*?<\/(?:\w+:)?AddtlNtryInf>/g) ?? []),
        ...(entry.match(/<(?:\w+:)?EndToEndId>[\s\S]*?<\/(?:\w+:)?EndToEndId>/g) ?? []),
      ];
      credits.push({ amountCents: Math.round(Number(amount[1]) * 100), text: stripTags(texts.join(' ')) });
    }
    return credits;
  }
  // MT940: ":61:" lines carry date, C(redit) or D(ebit) and the amount; ":86:" describes it.
  const credits: StatementCredit[] = [];
  const blocks = content.split(/\r?\n(?=:61:)/);
  for (const block of blocks) {
    const line = block.match(/:61:\d{6}(?:\d{4})?(R?[CD])[A-Z]?(\d+,\d{0,2})/);
    if (!line || line[1] !== 'C') continue;
    const description = (block.match(/:86:([\s\S]*?)(?=\r?\n:\d{2}[A-Z]?:|$)/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    credits.push({ amountCents: Math.round(Number(line[2]!.replace(',', '.')) * 100), text: description });
  }
  return credits;
}

/**
 * Matches incoming transfers to open invoices by the invoice number in the description and the
 * exact amount. The account may receive other money too: anything that does not match is left
 * alone, for a person.
 */
export async function importStatement(deps: BillingDeps, content: string): Promise<{ matched: string[]; unmatched: number }> {
  const credits = parseStatement(content);
  const matched: string[] = [];
  let unmatched = 0;
  // People type "IG2026-0001", "ig 2026 0001" or "IG20260001"; the prefix is required.
  const pattern = new RegExp(`\\b${deps.billing.invoicePrefix}\\s?(20\\d{2})[-\\s]?(\\d{4})\\b`, 'gi');
  for (const credit of credits) {
    const numbers = [...credit.text.matchAll(pattern)].map((m) => `${deps.billing.invoicePrefix}${m[1]}-${m[2]}`);
    let found = false;
    for (const number of numbers) {
      const [invoice] = await deps.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.number, number), eq(invoices.status, 'open'), eq(invoices.totalCents, credit.amountCents)))
        .limit(1);
      if (invoice && (await markPaid(deps, invoice.id, 'transfer'))) {
        matched.push(number);
        found = true;
        break;
      }
    }
    if (!found) unmatched++;
  }
  return { matched, unmatched };
}

/** A day after the due date, one friendly reminder. */
export async function remindOverdue(deps: BillingDeps): Promise<number> {
  const overdue = await deps.db
    .select()
    .from(invoices)
    .where(and(eq(invoices.status, 'open'), lt(invoices.dueAt, new Date(Date.now() - 86_400_000)), isNull(invoices.reminderSentAt)))
    .orderBy(asc(invoices.dueAt))
    .limit(200);
  for (const invoice of overdue) {
    const words = MAIL_WORDS[invoice.lang];
    const body = renderMail({
      lang: invoice.lang,
      intro: words.reminderBody(invoice.number, money(invoice.totalCents, invoice.lang), day(invoice.dueAt, invoice.lang)),
      sections: [],
      button: { label: words.invoiceButton, url: invoiceLink(deps.origin, invoice) },
      footer: [words.advertiserWhy],
    });
    await queueMail(deps.db, { key: `reminder:${invoice.id}`, to: invoice.customerEmail, subject: words.reminderSubject(invoice.number), ...body });
    await deps.db.update(invoices).set({ reminderSentAt: new Date() }).where(eq(invoices.id, invoice.id));
  }
  return overdue.length;
}

/** A week before an offer ends: its numbers so far and a way to renew. */
export async function remindRenewals(deps: Omit<BillingDeps, 'billing' | 'cache'>): Promise<number> {
  const now = new Date();
  const ending = await deps.db
    .select()
    .from(sponsoredOffers)
    .where(
      and(
        eq(sponsoredOffers.status, 'active'),
        eq(sponsoredOffers.awaitingPayment, false),
        isNotNull(sponsoredOffers.endsAt),
        gte(sponsoredOffers.endsAt, now),
        lte(sponsoredOffers.endsAt, new Date(now.getTime() + 7 * 86_400_000)),
        isNull(sponsoredOffers.renewalReminderSentAt),
      ),
    )
    .limit(200);
  for (const offer of ending) {
    const [totals] = await deps.db
      .select({
        impressions: sql<number>`coalesce(sum(${offerStats.impressions}), 0)::int`,
        clicks: sql<number>`coalesce(sum(${offerStats.clicks}), 0)::int`,
      })
      .from(offerStats)
      .where(eq(offerStats.offerId, offer.id));
    const words = MAIL_WORDS[offer.lang];
    const number = (n: number) => new Intl.NumberFormat(LOCALES[offer.lang]).format(n);
    const body = renderMail({
      lang: offer.lang,
      intro: words.renewalBody(offer.title, day(offer.endsAt!, offer.lang), number(totals?.impressions ?? 0), number(totals?.clicks ?? 0)),
      sections: [],
      button: { label: words.renewalButton, url: `${deps.origin}/advertise/stats/${offer.statsToken}?lang=${offer.lang}` },
      footer: [words.advertiserWhy],
    });
    await queueMail(deps.db, { key: `renewal:${offer.id}`, to: offer.contactEmail, subject: words.renewalSubject(offer.title), ...body });
    await deps.db.update(sponsoredOffers).set({ renewalReminderSentAt: new Date() }).where(eq(sponsoredOffers.id, offer.id));
  }
  return ending.length;
}

export function toInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    number: row.number,
    token: row.token,
    offerId: row.offerId,
    lang: row.lang,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    lines: row.lines,
    subtotalCents: row.subtotalCents,
    vatRateBps: row.vatRateBps,
    vatNote: row.vatNote,
    vatCents: row.vatCents,
    totalCents: row.totalCents,
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    paidVia: row.paidVia,
  };
}

export async function listInvoices(db: Database, limit = 500) {
  const rows = await db.select().from(invoices).orderBy(desc(invoices.issuedAt)).limit(limit);
  return rows.map(toInvoice);
}

export async function invoicesForEmail(db: Database, email: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.customerEmail, email.trim().toLowerCase()))
    .orderBy(desc(invoices.issuedAt))
    .limit(200);
  return rows.map(toInvoice);
}

const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Every invoice issued in a quarter, for the bookkeeping: amounts in euros, VAT per invoice. */
export async function quarterCsv(db: Database, year: number, quarter: number): Promise<string> {
  const from = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const to = new Date(Date.UTC(year, quarter * 3, 1));
  const rows = await db
    .select()
    .from(invoices)
    .where(and(gte(invoices.issuedAt, from), lt(invoices.issuedAt, to)))
    .orderBy(asc(invoices.number));
  const euros = (cents: number) => (cents / 100).toFixed(2);
  const header = ['number', 'issued', 'customer', 'country', 'vat_number', 'subtotal', 'vat_rate', 'vat', 'total', 'vat_note', 'status', 'paid', 'paid_via'];
  const lines = rows.map((row) =>
    [
      row.number,
      row.issuedAt.toISOString().slice(0, 10),
      row.customerName,
      row.customerCountry ?? 'NL',
      row.customerVatNumber,
      euros(row.subtotalCents),
      (row.vatRateBps / 100).toFixed(2),
      euros(row.vatCents),
      euros(row.totalCents),
      row.vatNote,
      row.status,
      row.paidAt?.toISOString().slice(0, 10) ?? null,
      row.paidVia,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
