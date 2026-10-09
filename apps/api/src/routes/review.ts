/** The review queue for LLM drafts, deleting pages, and bulk draft requests. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { languageSchema, slugSchema } from '../lib/content.js';
import { HttpError } from '../lib/errors.js';
import { hashIp } from '../lib/hash.js';
import { errorSchema, reviewItemSchema } from '../schemas.js';
import { enqueueDraft } from '../services/drafts.js';
import { deletePage, reviewQueue } from '../services/pages.js';

const UNLIMITED = { perIpPerHour: Number.POSITIVE_INFINITY, globalPerHour: Number.POSITIVE_INFINITY };

export const reviewRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config; cache: CacheInvalidator }> = async (
  app,
  { db, config, cache },
) => {
  app.get(
    '/review',
    {
      schema: {
        tags: ['drafts'],
        summary: 'Drafts waiting to be checked, oldest first',
        description: 'Every logged in user can publish or improve a draft; this is the list to start from.',
        querystring: z.object({
          lang: languageSchema.optional(),
          limit: z.coerce.number().int().min(1).max(500).default(100),
        }),
        response: { 200: z.object({ drafts: z.array(reviewItemSchema) }) },
      },
    },
    async (request) => ({ drafts: await reviewQueue(db, request.query.lang, request.query.limit) }),
  );

  app.delete(
    '/pages/:lang/:slug',
    {
      schema: {
        tags: ['pages'],
        summary: 'Delete a page with its history (moderators: drafts only, admins: any page)',
        params: z.object({ lang: languageSchema, slug: slugSchema }),
        response: { 204: z.null(), 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireRole(request, 'moderator');
      const { lang, slug } = request.params;
      await deletePage(db, lang, slug, { allowPublished: user.role === 'admin' });
      request.log.info({ lang, slug, userId: user.id }, 'page deleted');
      await cache.purgePage(lang, slug);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/admin/drafts',
    {
      schema: {
        tags: ['admin'],
        summary: 'Queue first drafts for many subjects at once (admin)',
        description: 'Existing pages and subjects that are already queued are skipped. Not rate limited.',
        body: z.object({ lang: languageSchema, slugs: z.array(slugSchema).min(1).max(200) }),
        response: {
          200: z.object({
            queued: z.array(z.string()),
            skipped: z.array(z.object({ slug: z.string(), reason: z.string() })),
          }),
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request) => {
      const admin = requireRole(request, 'admin');
      const ipHash = hashIp(`admin:${admin.id}`, config.ipHashSalt);
      const queued: string[] = [];
      const skipped: Array<{ slug: string; reason: string }> = [];
      for (const slug of new Set(request.body.slugs)) {
        try {
          const { created } = await enqueueDraft(db, { lang: request.body.lang, slug, ipHash, userId: admin.id }, UNLIMITED);
          if (created) queued.push(slug);
          else skipped.push({ slug, reason: 'already_queued' });
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          skipped.push({ slug, reason: error.code });
        }
      }
      return { queued, skipped };
    },
  );
};
