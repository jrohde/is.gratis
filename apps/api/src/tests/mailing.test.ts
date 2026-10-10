import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { isoWeek, tick } from '../bot/scheduler.js';
import { weeklyMail } from '../bot/tasks.js';
import type { Mailer, OutgoingMail } from '../lib/mailer.js';
import { offerReaches, sendQueuedMail } from '../services/mailing.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));

const logger = { info: () => {}, warn: () => {} };
function memoryMailer(): Mailer & { sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = [];
  return { dryRun: true, sent, send: async (mail) => void sent.push(mail) };
}
const subscribeTo = (email: string, list: 'offers' | 'week', region: string | null = null, lang = 'nl') =>
  // Each from an address of its own: subscribing is rate limited per address.
  ctx.app.inject({ method: 'POST', url: '/api/mailing/subscribe', payload: { email, list, lang, region }, remoteAddress: nextAddress() });
let address = 0;
const nextAddress = () => `10.1.${Math.floor(++address / 250)}.${address % 250}`;
const tokenFrom = (mail: OutgoingMail) => mail.text.match(/\/mailing\/confirm\/([A-Za-z0-9_-]+)/)![1]!;

async function confirmed(email: string, list: 'offers' | 'week', region: string | null = null) {
  await subscribeTo(email, list, region);
  const mailer = memoryMailer();
  await sendQueuedMail(ctx.db, mailer, 10);
  const confirm = mailer.sent.find((mail) => mail.to === email)!;
  expect((await ctx.app.inject({ method: 'POST', url: `/api/mailing/confirm/${tokenFrom(confirm)}` })).statusCode).toBe(200);
}

describe('subscribing', () => {
  it('sends a confirmation first, and nothing else until it is confirmed', async () => {
    const response = await subscribeTo('Lezer@Example.com', 'week');
    expect(response.statusCode).toBe(202);
    const mailer = memoryMailer();
    expect(await sendQueuedMail(ctx.db, mailer, 10)).toEqual({ sent: 1, failed: 0 });
    expect(mailer.sent[0]).toMatchObject({ to: 'lezer@example.com', subject: 'Bevestig je inschrijving op is.gratis*' });
    expect(mailer.sent[0]!.html).toContain('Ja, ik wil deze mail');

    const rows = await ctx.db.execute<{ confirmed_at: Date | null }>(sql`select confirmed_at from subscriptions`);
    expect(rows.rows[0]!.confirmed_at).toBeNull();
    await ctx.app.inject({ method: 'POST', url: `/api/mailing/confirm/${tokenFrom(mailer.sent[0]!)}` });
    const after = await ctx.db.execute<{ confirmed_at: Date | null }>(sql`select confirmed_at from subscriptions`);
    expect(after.rows[0]!.confirmed_at).not.toBeNull();
  });

  it('answers the same for an address that is already subscribed, and sends it nothing new', async () => {
    await confirmed('lezer@example.com', 'week');
    expect((await subscribeTo('lezer@example.com', 'week')).statusCode).toBe(202);
    const mailer = memoryMailer();
    await sendQueuedMail(ctx.db, mailer, 10);
    expect(mailer.sent).toEqual([]);
  });

  it('changes the region only once the change is confirmed', async () => {
    await confirmed('lezer@example.com', 'offers', 'NL');
    await subscribeTo('lezer@example.com', 'offers', 'BE');
    const regions = async () =>
      (await ctx.db.execute<{ region: string; confirmed: boolean }>(sql`select region, confirmed_at is not null as confirmed from subscriptions order by region`)).rows;
    expect(await regions()).toEqual([
      { region: 'BE', confirmed: false },
      { region: 'NL', confirmed: true },
    ]);
    const mailer = memoryMailer();
    await sendQueuedMail(ctx.db, mailer, 10);
    await ctx.app.inject({ method: 'POST', url: `/api/mailing/confirm/${tokenFrom(mailer.sent[0]!)}` });
    expect(await regions()).toEqual([{ region: 'BE', confirmed: true }]);
  });

  it('deletes the address on unsubscribe, also with a one-click form post', async () => {
    await confirmed('lezer@example.com', 'week');
    const [row] = (await ctx.db.execute<{ token: string }>(sql`select token from subscriptions`)).rows;
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/mailing/unsubscribe/${row!.token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(response.statusCode).toBe(200);
    expect((await ctx.db.execute(sql`select 1 from subscriptions`)).rows).toEqual([]);
    expect((await ctx.app.inject({ method: 'POST', url: `/api/mailing/unsubscribe/${row!.token}` })).statusCode).toBe(404);
  });
});

describe('the weekly mail of free offers', () => {
  async function offer(region: string | null, mailing: boolean, title: string) {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      payload: {
        lang: 'nl',
        slug: 'kraanwater',
        region,
        advertiserName: 'Café',
        contactEmail: 'cafe@example.com',
        title,
        description: 'Gratis kraanwater bij elke tafel.',
        url: 'https://cafe.example',
        mailing,
      },
    });
    await ctx.db.execute(sql`update sponsored_offers set status = 'active' where id = ${created.json().id}`);
  }

  it('lists the offers that booked the mailing, for the subscriber’s region, and is sent once a week', async () => {
    const { cookie } = await register(ctx, 'writer@example.com');
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/pages/nl/kraanwater',
      headers: { cookie },
      payload: { title: 'kraanwater', content: sampleContent(), baseRevisionId: null },
    });
    await offer('NL', true, 'Water in Amsterdam');
    await offer('EU', true, 'Water in heel Europa');
    await offer('BE', true, 'Water in Gent');
    await offer('NL', false, 'Niet geboekt');
    await confirmed('nl@example.com', 'offers', 'NL');
    await confirmed('us@example.com', 'offers', 'US');

    const task = weeklyMail({ weekday: 1, time: '08:00', origin: 'https://is.gratis' });
    const monday = new Date('2026-10-12T09:00:00Z');
    await tick({ db: ctx.db, now: monday, logger }, [task]);
    await tick({ db: ctx.db, now: new Date('2026-10-12T15:00:00Z'), logger }, [task]);
    const mailer = memoryMailer();
    await sendQueuedMail(ctx.db, mailer, 50);
    expect(mailer.sent.map((mail) => mail.to)).toEqual(['nl@example.com']);
    const mail = mailer.sent[0]!;
    expect(mail.subject).toBe('2 gratis aanbiedingen deze week');
    expect(mail.text).toContain('Water in Amsterdam');
    expect(mail.text).toContain('Water in heel Europa');
    expect(mail.text).not.toContain('Gent');
    expect(mail.text).not.toContain('Niet geboekt');
    expect(mail.text).toMatch(/https:\/\/is\.gratis\/api\/offers\/[0-9a-f-]+\/go/);
    expect(mail.unsubscribeUrl).toMatch(/^https:\/\/is\.gratis\/mailing\/unsubscribe\//);
  });

  it('knows which offers reach which region', () => {
    expect(offerReaches('NL', 'NL')).toBe(true);
    expect(offerReaches('EU', 'BE')).toBe(true);
    expect(offerReaches('EU', 'US')).toBe(false);
    expect(offerReaches(null, 'US')).toBe(true);
    expect(offerReaches('WORLD', 'GB')).toBe(true);
    expect(offerReaches('BE', null)).toBe(true);
    expect(offerReaches('BE', 'NL')).toBe(false);
  });
});

describe('sending', () => {
  it('stops at the first failure and tries again later, giving up after five attempts', async () => {
    await subscribeTo('a@example.com', 'week');
    await subscribeTo('b@example.com', 'week');
    let calls = 0;
    const broken: Mailer = { dryRun: false, send: async () => (calls++, Promise.reject(new Error('connection refused'))) };
    expect(await sendQueuedMail(ctx.db, broken, 10)).toEqual({ sent: 0, failed: 1 });
    expect(calls).toBe(1);
    for (let i = 0; i < 10; i++) await sendQueuedMail(ctx.db, broken, 10);
    const rows = (await ctx.db.execute<{ status: string; attempts: number }>(sql`select status, attempts from mail_outbox order by "to"`)).rows;
    expect(rows).toEqual([
      { status: 'failed', attempts: 5 },
      { status: 'failed', attempts: 5 },
    ]);
  });

  it('numbers weeks the ISO way', () => {
    expect(isoWeek(new Date('2026-10-12T09:00:00Z'))).toBe('2026-W42');
    expect(isoWeek(new Date('2027-01-01T09:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2026-01-01T09:00:00Z'))).toBe('2026-W01');
  });
});
