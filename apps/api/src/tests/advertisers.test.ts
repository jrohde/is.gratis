import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Mailer, OutgoingMail } from '../lib/mailer.js';
import { sendQueuedMail } from '../services/mailing.js';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));

let address = 0;
const nextAddress = () => `10.2.${Math.floor(++address / 250)}.${address % 250}`;

async function sentMail(): Promise<OutgoingMail[]> {
  const sent: OutgoingMail[] = [];
  const mailer: Mailer = { dryRun: true, send: async (mail) => void sent.push(mail) };
  await sendQueuedMail(ctx.db, mailer, 50);
  return sent;
}

async function page(slug: string) {
  const { cookie } = await register(ctx, `writer-${slug}@example.com`, 'Tester', nextAddress());
  await ctx.app.inject({
    method: 'PUT',
    url: `/api/pages/nl/${slug}`,
    headers: { cookie },
    payload: { title: slug, content: sampleContent(), baseRevisionId: null },
  });
}

async function request(slug: string, email: string, region: string | null = null, title = 'Gratis proefles') {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/sponsors/requests',
    remoteAddress: nextAddress(),
    payload: {
      lang: 'nl',
      slug,
      region,
      advertiserName: `Zwemschool ${email.split('@')[0]}`,
      contactEmail: email,
      title,
      description: 'Een gratis proefles zwemmen.',
      url: 'https://zwem.example',
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; statsToken: string };
}

const loginLink = (mail: OutgoingMail) => mail.text.match(/\/advertise\/login\/([A-Za-z0-9_-]+)/)![1]!;

describe('advertiser portal', () => {
  it('mails the secret link after a request, so it cannot get lost', async () => {
    await page('zwemmen');
    const { statsToken } = await request('zwemmen', 'Info@Zwem.example');
    const [mail] = await sentMail();
    expect(mail).toMatchObject({ to: 'info@zwem.example', subject: 'We hebben je aanvraag ontvangen: Gratis proefles' });
    expect(mail!.text).toContain(`/advertise/stats/${statsToken}`);
  });

  it('signs in with a one-time link by mail and shows every offer of that address', async () => {
    await page('zwemmen');
    await request('zwemmen', 'info@zwem.example', null, 'Proefles');
    await request('zwemmen', 'info@zwem.example', 'NL', 'Tweede proefles');
    await request('zwemmen', 'ander@example.com');
    await sentMail();

    const asked = await ctx.app.inject({ method: 'POST', url: '/api/advertisers/login', payload: { email: 'INFO@zwem.example', lang: 'nl' } });
    expect(asked.statusCode).toBe(202);
    const [mail] = await sentMail();
    expect(mail!.subject).toBe('Je inloglink voor is.gratis*');
    const token = loginLink(mail!);

    const login = await ctx.app.inject({ method: 'POST', url: `/api/advertisers/login/${token}` });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'isg_adv')!;
    expect(cookie.httpOnly).toBe(true);

    const me = await ctx.app.inject({ method: 'GET', url: '/api/advertisers/me', headers: { cookie: `isg_adv=${cookie.value}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('info@zwem.example');
    expect(me.json().offers.map((o: { title: string }) => o.title).sort()).toEqual(['Proefles', 'Tweede proefles']);
    expect(me.json().offers[0]).toMatchObject({ claim: 'Zwemmen is gratis*', status: 'pending', editor: null });

    // The link works once.
    expect((await ctx.app.inject({ method: 'POST', url: `/api/advertisers/login/${token}` })).statusCode).toBe(404);
    await ctx.app.inject({ method: 'POST', url: '/api/advertisers/logout', headers: { cookie: `isg_adv=${cookie.value}` } });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/advertisers/me', headers: { cookie: `isg_adv=${cookie.value}` } })).statusCode).toBe(401);
  });

  it('sends nothing to an address without requests, and answers the same', async () => {
    const asked = await ctx.app.inject({ method: 'POST', url: '/api/advertisers/login', payload: { email: 'nobody@example.com', lang: 'nl' } });
    expect(asked.statusCode).toBe(202);
    expect(await sentMail()).toEqual([]);
  });

  it('shows the editors’ reason to the advertiser', async () => {
    await page('zwemmen');
    const { id } = await request('zwemmen', 'info@zwem.example');
    await ctx.db.execute(sql`
      update sponsored_offers set editor_decision = 'reject', editor_notes = 'Na de proefles volgt een betaald abonnement.', editor_checked_at = now()
      where id = ${id}
    `);
    await sentMail();
    await ctx.app.inject({ method: 'POST', url: '/api/advertisers/login', payload: { email: 'info@zwem.example', lang: 'nl' } });
    const token = loginLink((await sentMail())[0]!);
    const login = await ctx.app.inject({ method: 'POST', url: `/api/advertisers/login/${token}` });
    const cookie = login.cookies.find((c) => c.name === 'isg_adv')!;
    const me = await ctx.app.inject({ method: 'GET', url: '/api/advertisers/me', headers: { cookie: `isg_adv=${cookie.value}` } });
    expect(me.json().offers[0].editor).toEqual({ decision: 'reject', notes: 'Na de proefles volgt een betaald abonnement.' });
  });
});

describe('spots on a page', () => {
  it('will not activate a fourth offer for the same readers, but does for other readers or a later period', async () => {
    await page('zwemmen');
    const { cookie } = await register(ctx, 'admin@example.com', 'Admin', nextAddress());
    const activate = (id: string, startsAt: string | null = null, endsAt: string | null = null) =>
      ctx.app.inject({ method: 'POST', url: `/api/admin/sponsors/${id}/review`, headers: { cookie }, payload: { status: 'active', startsAt, endsAt } });

    for (const [i, region] of [null, 'NL', 'EU'].entries()) {
      const { id } = await request('zwemmen', `a${i}@example.com`, region);
      expect((await activate(id, null, '2099-01-01T00:00:00Z')).statusCode).toBe(200);
    }
    const quote = await ctx.app.inject({ url: '/api/sponsors/quote?lang=nl&slug=zwemmen&region=NL' });
    expect(quote.json().slotsFree).toBe(0);
    expect((await ctx.app.inject({ url: '/api/sponsors/quote?lang=nl&slug=zwemmen&region=US' })).json().slotsFree).toBe(2);

    // A reader in Belgium sees only "everywhere" and "EU" of these: there is room for one there.
    expect((await ctx.app.inject({ url: '/api/sponsors/quote?lang=nl&slug=zwemmen&region=BE' })).json().slotsFree).toBe(1);
    const fourth = await request('zwemmen', 'b@example.com', 'NL');
    const refused = await activate(fourth.id, null, '2099-01-01T00:00:00Z');
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('page_full');

    const american = await request('zwemmen', 'c@example.com', 'US');
    expect((await activate(american.id)).statusCode).toBe(200);
    expect((await activate(fourth.id, '2099-01-01T00:00:00Z', '2099-02-01T00:00:00Z')).statusCode).toBe(200);
  });

  it('shows offers for the EU and the world to readers there', async () => {
    await page('zwemmen');
    const { cookie } = await register(ctx, 'admin@example.com', 'Admin', nextAddress());
    const { id } = await request('zwemmen', 'a@example.com', 'EU', 'Europese proefles');
    await ctx.app.inject({ method: 'POST', url: `/api/admin/sponsors/${id}/review`, headers: { cookie }, payload: { status: 'active' } });
    const pageData = await ctx.app.inject({ url: '/api/pages/nl/zwemmen' });
    expect(pageData.json().sponsoredOffers.map((o: { region: string }) => o.region)).toEqual(['EU']);
  });
});

describe('fair play between advertisers', () => {
  async function admin() {
    return (await register(ctx, 'admin@example.com', 'Admin', nextAddress())).cookie;
  }
  const activate = (cookie: string, id: string) =>
    ctx.app.inject({ method: 'POST', url: `/api/admin/sponsors/${id}/review`, headers: { cookie }, payload: { status: 'active' } });

  it('gives one advertiser one spot per page for the same readers', async () => {
    await page('zwemmen');
    const cookie = await admin();
    const first = await request('zwemmen', 'school@example.com', 'NL');
    const second = await request('zwemmen', 'school@example.com', null, 'Nog een proefles');
    expect((await activate(cookie, first.id)).statusCode).toBe(200);
    const refused = await activate(cookie, second.id);
    expect(refused.json().error).toBe('one_per_advertiser');
  });

  it('sells a page to one advertiser alone, at the exclusive price, only when nobody else is there', async () => {
    await page('zwemmen');
    const cookie = await admin();
    const quote = (await ctx.app.inject({ url: '/api/sponsors/quote?lang=nl&slug=zwemmen&region=NL' })).json();
    expect(quote).toMatchObject({ priceCents: 2500, exclusivePriceCents: 6300, exclusiveAvailable: true });

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/sponsors/requests',
      remoteAddress: nextAddress(),
      payload: {
        lang: 'nl', slug: 'zwemmen', region: 'NL', advertiserName: 'Alleen', contactEmail: 'alleen@example.com',
        title: 'Gratis zwemles', description: 'Een gratis zwemles.', url: 'https://alleen.example', exclusive: true,
      },
    });
    const exclusive = created.json();
    expect(exclusive.priceCents).toBe(6300);
    expect((await activate(cookie, exclusive.id)).statusCode).toBe(200);

    const after = (await ctx.app.inject({ url: '/api/sponsors/quote?lang=nl&slug=zwemmen&region=NL' })).json();
    expect(after).toMatchObject({ slotsFree: 0, exclusiveAvailable: false });
    const other = await request('zwemmen', 'ander@example.com', 'NL');
    expect((await activate(cookie, other.id)).json().error).toBe('page_exclusive');
    // Readers elsewhere are not part of the exclusive booking.
    const american = await request('zwemmen', 'us@example.com', 'US');
    expect((await activate(cookie, american.id)).statusCode).toBe(200);
  });

  it('takes reports on offers, sends them back to the editors, and shows them to moderators', async () => {
    await page('zwemmen');
    const cookie = await admin();
    const { id } = await request('zwemmen', 'school@example.com');
    await ctx.db.execute(sql`update sponsored_offers set editor_decision = 'approve', editor_notes = 'Ok', editor_checked_at = now() - interval '2 days' where id = ${id}`);
    await activate(cookie, id);

    const report = await ctx.app.inject({
      method: 'POST',
      url: `/api/offers/${id}/reports`,
      remoteAddress: nextAddress(),
      payload: { reason: 'not_free', message: 'Na de proefles moet je een abonnement nemen.' },
    });
    expect(report.statusCode).toBe(201);
    const decision = async () =>
      (await ctx.db.execute<{ editor_decision: string | null }>(sql`select editor_decision from sponsored_offers where id = ${id}`)).rows[0]!.editor_decision;
    expect(await decision()).toBeNull();
    // Checked again today: another report does not send it back to the editors before tomorrow.
    await ctx.db.execute(sql`update sponsored_offers set editor_decision = 'approve', editor_checked_at = now() where id = ${id}`);
    await ctx.app.inject({ method: 'POST', url: `/api/offers/${id}/reports`, remoteAddress: nextAddress(), payload: { reason: 'misleading' } });
    expect(await decision()).toBe('approve');

    const reports = await ctx.app.inject({ method: 'GET', url: '/api/reports', headers: { cookie } });
    expect(reports.json().reports.find((r: { reason: string }) => r.reason === 'not_free')).toMatchObject({
      reason: 'not_free',
      slug: 'zwemmen',
      offer: { id, title: 'Gratis proefles', advertiserName: 'Zwemschool school' },
    });
    // Page reasons are for pages, offer reasons for offers.
    const wrong = await ctx.app.inject({ method: 'POST', url: `/api/offers/${id}/reports`, remoteAddress: nextAddress(), payload: { reason: 'copyright' } });
    expect(wrong.statusCode).toBe(400);
  });
});

describe('choosing a page', () => {
  it('lists pages busiest first, with price and free spots, and searches titles', async () => {
    await page('zwemmen');
    await page('zwembad');
    await page('lucht');
    await ctx.db.execute(sql`
      insert into page_views (page_id, day, count)
      select id, current_date, case slug when 'zwembad' then 500 else 10 end from pages where lang = 'nl'
    `);
    const all = (await ctx.app.inject({ url: '/api/sponsors/pages?lang=nl' })).json().pages;
    expect(all.map((p: { slug: string }) => p.slug)).toEqual(['zwembad', 'lucht', 'zwemmen']);
    expect(all[0]).toMatchObject({ views30: 500, priceCents: 2700, slotsFree: 3 });
    const found = (await ctx.app.inject({ url: '/api/sponsors/pages?lang=nl&q=zwem' })).json().pages;
    expect(found.map((p: { slug: string }) => p.slug)).toEqual(['zwembad', 'zwemmen']);
    // A search for a wildcard is a search for that character, not for everything.
    expect((await ctx.app.inject({ url: '/api/sponsors/pages?lang=nl&q=%25' })).json().pages).toEqual([]);
  });
});

describe('numbers for advertisers', () => {
  it('shows reach, clicks from the mail apart, cost per click and a CSV', async () => {
    await page('zwemmen');
    const { cookie } = await register(ctx, 'admin@example.com', 'Admin', nextAddress());
    const { id, statsToken } = await request('zwemmen', 'school@example.com');
    await ctx.app.inject({ method: 'POST', url: `/api/admin/sponsors/${id}/review`, headers: { cookie }, payload: { status: 'active' } });
    await ctx.db.execute(sql`
      insert into page_views (page_id, day, count) select id, current_date, 200 from pages where slug = 'zwemmen'
    `);
    await ctx.db.execute(sql`insert into offer_stats (offer_id, day, impressions, mail_sends) values (${id}, current_date, 150, 40)`);
    for (let i = 0; i < 3; i++) await ctx.app.inject({ url: `/api/offers/${id}/go` });
    await ctx.app.inject({ url: `/api/offers/${id}/go?from=mail` });

    const stats = (await ctx.app.inject({ url: `/api/sponsors/stats/${statsToken}` })).json();
    expect(stats.totals).toEqual({ impressions: 150, clicks: 3, mailSends: 40, mailClicks: 1, pageViews: 200 });
    expect(stats.reach).toBe(0.75);
    // The booked price over every click, from the page and from the mail.
    expect(stats.costPerClickCents).toBe(Math.round(2500 / 4));
    expect(stats.averageClickRate).toBeNull();

    const csv = await ctx.app.inject({ url: `/api/sponsors/stats/${statsToken}/csv` });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.split('\n')[1]).toMatch(/^\d{4}-\d{2}-\d{2},200,150,3,40,1$/);
  });
});
