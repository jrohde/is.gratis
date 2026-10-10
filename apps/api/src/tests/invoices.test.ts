import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { epcPayload } from '../lib/invoice-pdf.js';
import type { Mailer, OutgoingMail } from '../lib/mailer.js';
import { monthsIn, parseStatement, quarterCsv, remindOverdue } from '../services/invoices.js';
import { sendQueuedMail } from '../services/mailing.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

// A stand-in for Mollie: payments are created "open", and the test decides when one is paid.
const molliePayments = new Map<string, { status: string; amount: string; invoiceId: string }>();
const mollieFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (init?.method === 'POST' && url.endsWith('/payments')) {
    const body = JSON.parse(String(init.body)) as { amount: { value: string }; metadata: { invoiceId: string } };
    const id = `tr_${molliePayments.size + 1}`;
    molliePayments.set(id, { status: 'open', amount: body.amount.value, invoiceId: body.metadata.invoiceId });
    return Response.json({ id, _links: { checkout: { href: `https://mollie.test/checkout/${id}` } } });
  }
  const id = url.split('/').pop()!;
  const payment = molliePayments.get(id);
  if (!payment) return new Response('{}', { status: 404 });
  return Response.json({ id, status: payment.status, amount: { value: payment.amount, currency: 'EUR' }, metadata: { invoiceId: payment.invoiceId } });
}) as typeof fetch;

let ctx: TestContext;
beforeAll(async () => {
  const base = loadConfig();
  ctx = await createTestApp(
    {
      billing: {
        ...base.billing,
        enabled: true,
        companyName: 'is.gratis',
        companyAddress: 'Gratisstraat 1|1234 AB Amsterdam',
        iban: 'NL91ABNA0417164300',
        bic: 'ABNANL2A',
        vatRateBps: 2100,
        dueDays: 14,
        mollieApiKey: 'test_key',
      },
      sponsorPricing: { baseCents: 2500, perThousandCents: 400, mailingCents: 500, exclusivePercent: 250 },
    },
    { mollieFetch },
  );
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  molliePayments.clear();
  await resetDatabase(ctx);
});

let address = 0;
const nextAddress = () => `10.3.${Math.floor(++address / 250)}.${address % 250}`;

async function sentMail(): Promise<OutgoingMail[]> {
  const sent: OutgoingMail[] = [];
  const mailer: Mailer = { dryRun: true, send: async (mail) => void sent.push(mail) };
  await sendQueuedMail(ctx.db, mailer, 50);
  return sent;
}

async function setup() {
  const { cookie: writer } = await register(ctx, 'writer@example.com', 'Tester', nextAddress());
  await ctx.app.inject({
    method: 'PUT',
    url: '/api/pages/nl/zwemmen',
    headers: { cookie: writer },
    payload: { title: 'zwemmen', content: sampleContent(), baseRevisionId: null },
  });
  return (await register(ctx, 'admin@example.com', 'Admin', nextAddress())).cookie;
}

async function request(extra: Record<string, unknown> = {}) {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/sponsors/requests',
    remoteAddress: nextAddress(),
    payload: {
      lang: 'nl',
      slug: 'zwemmen',
      region: null,
      advertiserName: 'Zwemschool',
      contactEmail: 'info@zwem.example',
      title: 'Gratis proefles',
      description: 'Een gratis proefles zwemmen.',
      url: 'https://zwem.example',
      billingAddress: 'Badweg 2\n1000 AA Amsterdam',
      billingCountry: 'NL',
      ...extra,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

const approve = (cookie: string, id: string) =>
  ctx.app.inject({
    method: 'POST',
    url: `/api/admin/sponsors/${id}/review`,
    headers: { cookie },
    payload: { status: 'active', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 61 * 86_400_000).toISOString() },
  });

const visibleOffers = async () => (await ctx.app.inject({ url: '/api/pages/nl/zwemmen' })).json().sponsoredOffers as unknown[];
const invoiceToken = (mail: OutgoingMail) => mail.text.match(/\/advertise\/invoice\/([A-Za-z0-9_-]+)/)![1]!;

describe('invoices', () => {
  it('invoices a new advertiser on approval, and shows the offer only once it is paid online', async () => {
    const admin = await setup();
    const { id } = await request({ mailing: true });
    await sentMail();
    const approved = await approve(admin, id);
    expect(approved.statusCode).toBe(200);
    expect(approved.json().booking.awaitingPayment).toBe(true);
    expect(await visibleOffers()).toEqual([]);

    const [mail] = await sentMail();
    expect(mail!.subject).toBe(`Factuur IG${new Date().getUTCFullYear()}-0001 van is.gratis`);
    expect(mail!.text).toContain('Je aanbod gaat live zodra de betaling binnen is.');
    const token = invoiceToken(mail!);

    const { invoice, payOnline } = (await ctx.app.inject({ url: `/api/invoices/${token}` })).json();
    expect(payOnline).toBe(true);
    // Two months of the spot and of the mailing, plus 21% VAT.
    expect(invoice).toMatchObject({ subtotalCents: 6000, vatRateBps: 2100, vatCents: 1260, totalCents: 7260, status: 'open' });
    expect(invoice.lines).toHaveLength(2);

    const pay = await ctx.app.inject({ method: 'POST', url: `/api/invoices/${token}/pay` });
    expect(pay.json().checkoutUrl).toBe('https://mollie.test/checkout/tr_1');
    // The webhook alone changes nothing: we ask Mollie, and it is not paid yet.
    const webhook = () =>
      ctx.app.inject({ method: 'POST', url: '/api/payments/mollie/webhook', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'id=tr_1' });
    expect((await webhook()).statusCode).toBe(200);
    expect(await visibleOffers()).toEqual([]);

    molliePayments.get('tr_1')!.status = 'paid';
    await webhook();
    expect(await visibleOffers()).toHaveLength(1);
    const after = (await ctx.app.inject({ url: `/api/invoices/${token}` })).json().invoice;
    expect(after).toMatchObject({ status: 'paid', paidVia: 'mollie' });
    expect((await sentMail()).map((m) => m.subject)).toEqual([`Betaald: factuur ${after.number}`]);
    // An unknown payment id is ignored quietly.
    const unknown = await ctx.app.inject({ method: 'POST', url: '/api/payments/mollie/webhook', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'id=tr_999' });
    expect(unknown.statusCode).toBe(200);
  });

  it('lets an advertiser who paid before go live right away', async () => {
    const admin = await setup();
    const first = await request();
    await approve(admin, first.id);
    await ctx.db.execute(sql`update invoices set status = 'paid', paid_at = now()`);
    await ctx.db.execute(sql`update sponsored_offers set status = 'expired' where id = ${first.id}`);
    const second = await request({ title: 'Nog een proefles' });
    const approved = await approve(admin, second.id);
    expect(approved.json().booking.awaitingPayment).toBe(false);
    expect(await visibleOffers()).toHaveLength(1);
  });

  it('reverse charges VAT for a business elsewhere in the EU, and charges none outside the EU', async () => {
    const admin = await setup();
    const belgian = await request({ billingCountry: 'be', vatNumber: 'BE 0123.456.789' });
    await approve(admin, belgian.id);
    const [invoice] = (await ctx.db.execute<{ vat_rate_bps: number; vat_note: string; customer_vat_number: string }>(sql`select vat_rate_bps, vat_note, customer_vat_number from invoices`)).rows;
    expect(invoice).toMatchObject({ vat_rate_bps: 0, customer_vat_number: 'BE0123456789' });
    expect(invoice!.vat_note).toContain('Btw verlegd');
  });

  it('renders a PDF with a QR code for the transfer', async () => {
    const admin = await setup();
    await approve(admin, (await request()).id);
    const token = invoiceToken((await sentMail()).find((m) => m.subject.startsWith('Factuur'))!);
    const pdf = await ctx.app.inject({ url: `/api/invoices/${token}/pdf` });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect(epcPayload({ name: 'is.gratis', iban: 'NL91 ABNA 0417 1643 00', bic: 'ABNANL2A', amountCents: 3025, text: '2026-0001' })).toBe(
      'BCD\n002\n1\nSCT\nABNANL2A\nis.gratis\nNL91ABNA0417164300\nEUR30.25\n\n\n2026-0001',
    );
  });
});

describe('bank statements', () => {
  const camt = (amount: string, text: string) => `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>CRDT</CdtDbtInd><NtryDtls><TxDtls><RmtInf><Ustrd>${text}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>DBIT</CdtDbtInd><NtryDtls><TxDtls><RmtInf><Ustrd>${text}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

  it('reads credits from CAMT.053 and MT940, and leaves debits out', () => {
    expect(parseStatement(camt('30.25', 'Factuur 2026-0001'))).toEqual([{ amountCents: 3025, text: 'Factuur 2026-0001' }]);
    const mt940 = ':20:ABN\n:25:NL91ABNA0417164300\n:61:2610121012C30,25N654NONREF\n:86:/TRTP/SEPA OVERBOEKING/REMI/factuur 2026 0001\n:61:2610121012D10,00N654NONREF\n:86:/REMI/iets anders\n:62F:C261012EUR100,00';
    expect(parseStatement(mt940)).toEqual([{ amountCents: 3025, text: '/TRTP/SEPA OVERBOEKING/REMI/factuur 2026 0001' }]);
  });

  it('marks an invoice paid when number and amount match, and only then', async () => {
    const admin = await setup();
    await approve(admin, (await request()).id);
    const [invoice] = (await ctx.db.execute<{ number: string; total_cents: number }>(sql`select number, total_cents from invoices`)).rows;
    const upload = (content: string) =>
      ctx.app.inject({ method: 'POST', url: '/api/admin/invoices/statement', headers: { cookie: admin }, payload: { content } });
    const wrongAmount = await upload(camt(((invoice!.total_cents - 100) / 100).toFixed(2), `Factuur ${invoice!.number}`));
    expect(wrongAmount.json()).toEqual({ matched: [], unmatched: 1 });
    // Other money on the same account is left alone.
    const other = await upload(camt((invoice!.total_cents / 100).toFixed(2), 'Huur maart 2026-0001'));
    expect(other.json()).toEqual({ matched: [], unmatched: 1 });
    const right = await upload(camt((invoice!.total_cents / 100).toFixed(2), `betaling ${invoice!.number.replace('-', ' ').toLowerCase()}`));
    expect(right.json()).toEqual({ matched: [invoice!.number], unmatched: 0 });
    expect(await visibleOffers()).toHaveLength(1);
  });
});

describe('reminders and bookkeeping', () => {
  it('reminds once after the due date', async () => {
    const admin = await setup();
    await approve(admin, (await request()).id);
    await sentMail();
    const deps = { db: ctx.db, billing: ctx.config.billing, origin: 'https://is.gratis', cache: ctx.cache };
    expect(await remindOverdue(deps)).toBe(0);
    await ctx.db.execute(sql`update invoices set due_at = now() - interval '3 days'`);
    expect(await remindOverdue(deps)).toBe(1);
    expect(await remindOverdue(deps)).toBe(0);
    expect((await sentMail())[0]!.subject).toMatch(/^Herinnering: factuur /);
  });

  it('exports a quarter as CSV and never loses an invoice number', async () => {
    const admin = await setup();
    await approve(admin, (await request()).id);
    const [row] = (await ctx.db.execute<{ id: string }>(sql`select id from invoices`)).rows;
    expect((await ctx.app.inject({ method: 'POST', url: `/api/admin/invoices/${row!.id}/void`, headers: { cookie: admin } })).statusCode).toBe(204);
    const now = new Date();
    const csv = await quarterCsv(ctx.db, now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) + 1);
    const [header, line] = csv.trim().split('\n');
    expect(header).toBe('number,issued,customer,country,vat_number,subtotal,vat_rate,vat,total,vat_note,status,paid,paid_via');
    expect(line).toContain(',void,');
  });

  it('counts whole months in a period', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    expect(monthsIn(start, new Date('2026-10-20T00:00:00Z'))).toBe(1);
    expect(monthsIn(start, new Date('2026-11-01T00:00:00Z'))).toBe(1);
    expect(monthsIn(start, new Date('2027-01-01T00:00:00Z'))).toBe(3);
  });
});
