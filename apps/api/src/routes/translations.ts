import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema, slugSchema } from '../lib/content.js';
import { HttpError } from '../lib/errors.js';
import { hashIp } from '../lib/hash.js';
import { draftJobSchema, errorSchema } from '../schemas.js';
import { enqueueTranslation, linkTranslation, untranslated } from '../services/translations.js';
import type { CacheInvalidator } from '../lib/cache.js';

const UNLIMITED = { perIpPerHour: Number.POSITIVE_INFINITY, globalPerHour: Number.POSITIVE_INFINITY };

export const translationRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config; cache: CacheInvalidator }> = async (
  app,
  { db, config, cache },
) => {
  app.post(
    '/pages/:lang/:slug/link',
    {
      schema: {
        tags: ['pages'],
        summary: 'Link this page to the same subject in another language (moderator)',
        params: z.object({ lang: languageSchema, slug: slugSchema }),
        body: z.object({ lang: languageSchema, slug: slugSchema }),
        response: { 204: z.null(), 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireRole(request, 'moderator');
      const affected = await linkTranslation(db, request.params, request.body);
      request.log.info({ page: request.params, other: request.body, userId: user.id }, 'translation linked');
      await Promise.all(affected.map((p) => cache.purgePage(p.lang, p.slug)));
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/pages/:lang/:slug/translate',
    {
      schema: {
        tags: ['drafts'],
        summary: 'Have a checked page translated into another language by the LLM',
        description: 'The translation appears as a draft, linked to the same subject, until a person checks it.',
        params: z.object({ lang: languageSchema, slug: slugSchema }),
        body: z.object({ to: languageSchema }),
        response: {
          200: z.object({ job: draftJobSchema }),
          202: z.object({ job: draftJobSchema }),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { job, created } = await enqueueTranslation(
        db,
        { from: request.params.lang, slug: request.params.slug, to: request.body.to, ipHash: hashIp(request.ip, config.ipHashSalt), userId: user.id },
        config.drafts,
      );
      return reply.code(created ? 202 : 200).send({ job });
    },
  );

  app.post(
    '/admin/translations',
    {
      schema: {
        tags: ['admin'],
        summary: 'Translate every checked page that is missing in a language (admin)',
        body: z.object({ from: languageSchema, to: languageSchema, limit: z.number().int().min(1).max(200).default(50) }),
        response: { 200: z.object({ queued: z.number().int(), skipped: z.number().int() }), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      const admin = requireRole(request, 'admin');
      const { from, to, limit } = request.body;
      const ipHash = hashIp(`admin:${admin.id}`, config.ipHashSalt);
      let queued = 0;
      let skipped = 0;
      for (const slug of await untranslated(db, from, to, limit)) {
        try {
          const { created } = await enqueueTranslation(db, { from, slug, to, ipHash, userId: admin.id }, UNLIMITED);
          if (created) queued++;
          else skipped++;
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          skipped++;
        }
      }
      return { queued, skipped };
    },
  );
};
