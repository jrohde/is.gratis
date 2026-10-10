/** Mailing lists: subscribe (confirmed by mail), confirm, unsubscribe, and numbers for the admin. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MAILING_LISTS } from '@isgratis/types';
import { requireRole } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema, regionSchema } from '../lib/content.js';
import { notFound } from '../lib/errors.js';
import { errorSchema } from '../schemas.js';
import { confirmSubscription, mailingStats, subscribe, unsubscribe } from '../services/mailing.js';

const tokenParams = z.object({ token: z.string().min(16).max(128) });

export const mailingRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  // Mail clients unsubscribe with one click by POSTing a form (RFC 8058); its body says nothing new.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, _body, done) => done(null, {}));

  app.post(
    '/mailing/subscribe',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['mailing'],
        summary: 'Subscribe to a mailing list; a mail with a link confirms it',
        description: 'The answer is the same for new, waiting and existing subscriptions.',
        body: z.object({
          email: z.email().max(254),
          list: z.enum(MAILING_LISTS),
          lang: languageSchema,
          region: regionSchema.nullable().default(null),
        }),
        response: { 202: z.object({ ok: z.literal(true) }), 429: errorSchema },
      },
    },
    async (request, reply) => {
      await subscribe(db, request.body, config.publicOrigin);
      return reply.code(202).send({ ok: true });
    },
  );

  app.post(
    '/mailing/confirm/:token',
    {
      schema: {
        tags: ['mailing'],
        summary: 'Confirm a subscription with the link from the mail',
        description: 'A POST, so link scanners in mail systems that open every link do not confirm it.',
        params: tokenParams,
        response: { 200: z.object({ list: z.enum(MAILING_LISTS), lang: languageSchema }), 404: errorSchema },
      },
    },
    async (request) => {
      const confirmed = await confirmSubscription(db, request.params.token);
      if (!confirmed) throw notFound('This link is not valid (anymore)');
      return confirmed;
    },
  );

  app.post(
    '/mailing/unsubscribe/:token',
    {
      schema: {
        tags: ['mailing'],
        summary: 'Unsubscribe; also the one-click unsubscribe of mail clients',
        params: tokenParams,
        response: { 200: z.object({ ok: z.literal(true) }), 404: errorSchema },
      },
    },
    async (request) => {
      if (!(await unsubscribe(db, request.params.token))) throw notFound('This link is not valid (anymore)');
      return { ok: true as const };
    },
  );

  app.get(
    '/admin/mailing',
    {
      schema: {
        tags: ['admin'],
        summary: 'Subscribers per list and language, and the state of the outbox (admin)',
        response: {
          200: z.object({
            lists: z.array(z.object({ list: z.string(), lang: z.string(), confirmed: z.number().int(), waiting: z.number().int() })),
            outbox: z.record(z.string(), z.number().int()),
          }),
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      requireRole(request, 'admin');
      reply.header('cache-control', 'private, no-store');
      return mailingStats(db);
    },
  );
};
