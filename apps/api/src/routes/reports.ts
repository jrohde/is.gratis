import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OFFER_REPORT_REASONS, REPORT_REASONS } from '@isgratis/types';
import { requireRole } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema, slugSchema } from '../lib/content.js';
import { hashIp } from '../lib/hash.js';
import { errorSchema } from '../schemas.js';
import { createOfferReport, createReport, listReports, resolveReport } from '../services/reports.js';

const reportSchema = z.object({
  id: z.string(),
  lang: languageSchema,
  slug: z.string(),
  title: z.string(),
  reason: z.enum([...REPORT_REASONS, ...OFFER_REPORT_REASONS]),
  message: z.string().nullable(),
  status: z.enum(['open', 'resolved']),
  createdAt: z.string(),
  offer: z.object({ id: z.string(), title: z.string(), advertiserName: z.string() }).optional(),
});

export const reportRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  app.post(
    '/pages/:lang/:slug/reports',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['community'],
        summary: 'Report a problem with a page; no account needed',
        params: z.object({ lang: languageSchema, slug: slugSchema }),
        body: z.object({ reason: z.enum(REPORT_REASONS), message: z.string().trim().max(1000).optional() }),
        response: { 201: z.object({ id: z.string() }), 404: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const id = await createReport(
        db,
        {
          ...request.params,
          ...request.body,
          ipHash: hashIp(request.ip, config.ipHashSalt),
          userId: request.user?.id ?? null,
        },
        5,
      );
      request.log.info({ reportId: id, ...request.params, reason: request.body.reason }, 'page reported');
      return reply.code(201).send({ id });
    },
  );

  app.post(
    '/offers/:id/reports',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Report a sponsored offer that is not really free or misleading; no account needed',
        params: z.object({ id: z.uuid() }),
        body: z.object({ reason: z.enum(OFFER_REPORT_REASONS), message: z.string().trim().max(1000).optional() }),
        response: { 201: z.object({ id: z.string() }), 404: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const id = await createOfferReport(
        db,
        { offerId: request.params.id, ...request.body, ipHash: hashIp(request.ip, config.ipHashSalt), userId: request.user?.id ?? null },
        5,
      );
      request.log.info({ reportId: id, offerId: request.params.id, reason: request.body.reason }, 'offer reported');
      return reply.code(201).send({ id });
    },
  );

  app.get(
    '/reports',
    {
      schema: {
        tags: ['community'],
        summary: 'Reports, newest first (moderator)',
        querystring: z.object({ status: z.enum(['open', 'resolved']).default('open') }),
        response: { 200: z.object({ reports: z.array(reportSchema) }), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request, reply) => {
      requireRole(request, 'moderator');
      reply.header('cache-control', 'private, no-store');
      return { reports: await listReports(db, request.query.status) };
    },
  );

  app.post(
    '/reports/:id/resolve',
    {
      schema: {
        tags: ['community'],
        summary: 'Mark a report as handled (moderator)',
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null(), 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireRole(request, 'moderator');
      await resolveReport(db, request.params.id, user.id);
      return reply.code(204).send(null);
    },
  );
};
