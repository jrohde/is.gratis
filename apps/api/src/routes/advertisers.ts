/** The advertiser portal: sign in with a link by mail, then every offer of that address. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema } from '../lib/content.js';
import { notFound, unauthorized } from '../lib/errors.js';
import { errorSchema } from '../schemas.js';
import {
  advertiserForSession,
  advertiserOffers,
  consumeAdvertiserLogin,
  endAdvertiserSession,
  requestAdvertiserLogin,
} from '../services/advertisers.js';

/** Separate from the editors' session: an advertiser is not a user of the encyclopedia. */
export const ADVERTISER_COOKIE = 'isg_adv';

const portalOfferSchema = z.object({
  id: z.string(),
  statsToken: z.string(),
  lang: languageSchema,
  slug: z.string(),
  claim: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  region: z.string().nullable(),
  status: z.enum(['pending', 'active', 'rejected', 'expired']),
  priceCents: z.number().int().nullable(),
  inMailing: z.boolean(),
  mailingPriceCents: z.number().int().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
  editor: z
    .object({
      decision: z.enum(['approve', 'reject', 'unsure']),
      notes: z.string(),
      suggestion: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
    })
    .nullable(),
  impressions: z.number().int(),
  clicks: z.number().int(),
});

export const advertiserRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  app.post(
    '/advertisers/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Mail a sign-in link for the advertiser portal',
        description: 'Only addresses that made a request get a mail; the answer is the same for every address.',
        body: z.object({ email: z.email().max(254), lang: languageSchema }),
        response: { 202: z.object({ ok: z.literal(true) }), 429: errorSchema },
      },
    },
    async (request, reply) => {
      await requestAdvertiserLogin(db, request.body, config.publicOrigin);
      return reply.code(202).send({ ok: true });
    },
  );

  app.post(
    '/advertisers/login/:token',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Sign in with the link from the mail',
        description: 'A POST, so link scanners in mail systems cannot use up the link.',
        params: z.object({ token: z.string().min(16).max(128) }),
        response: { 200: z.object({ email: z.string() }), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const session = await consumeAdvertiserLogin(db, request.params.token);
      if (!session) throw notFound('This link does not work (anymore). Ask for a new one.');
      reply.setCookie(ADVERTISER_COOKIE, session.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        domain: config.cookieDomain,
        expires: session.expiresAt,
      });
      return { email: session.email };
    },
  );

  app.get(
    '/advertisers/me',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'The signed-in advertiser and all their offers',
        response: { 200: z.object({ email: z.string(), offers: z.array(portalOfferSchema) }), 401: errorSchema },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const token = request.cookies[ADVERTISER_COOKIE];
      const email = token ? await advertiserForSession(db, token) : null;
      if (!email) throw unauthorized();
      return { email, offers: await advertiserOffers(db, email) };
    },
  );

  app.post(
    '/advertisers/logout',
    {
      schema: { tags: ['sponsors'], summary: 'Sign out of the advertiser portal', response: { 204: z.null() } },
    },
    async (request, reply) => {
      const token = request.cookies[ADVERTISER_COOKIE];
      if (token) await endAdvertiserSession(db, token);
      reply.clearCookie(ADVERTISER_COOKIE, { path: '/', domain: config.cookieDomain });
      return reply.code(204).send(null);
    },
  );
};
