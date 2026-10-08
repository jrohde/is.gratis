import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LANGUAGES, pickLanguage } from '@isgratis/types';
import { requireUser } from '../auth.js';
import { badRequest } from '../lib/errors.js';
import { getAssetMeta } from '../services/assets.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { languageSchema, pageContentSchema, slugSchema, titleSchema } from '../lib/content.js';
import {
  errorSchema,
  pageListItemSchema,
  pageSchema,
  revisionSchema,
  revisionSummarySchema,
} from '../schemas.js';
import {
  getPage,
  getRevision,
  languagesForSlug,
  listPages,
  listRevisions,
  publishPage,
  revertPage,
  saveRevision,
  sitemapEntries,
} from '../services/pages.js';

const pageParams = z.object({ lang: languageSchema, slug: slugSchema });
const editRateLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } };

export const pageRoutes: FastifyPluginAsyncZod<{ db: Database; cache: CacheInvalidator }> = async (
  app,
  { db, cache },
) => {
  app.get(
    '/pages',
    {
      schema: {
        tags: ['pages'],
        summary: 'Recently changed pages',
        querystring: z.object({
          lang: languageSchema.optional(),
          status: z.enum(['draft', 'published']).optional(),
          limit: z.coerce.number().int().min(1).max(1000).default(20),
          offset: z.coerce.number().int().min(0).max(10_000).default(0),
        }),
        response: { 200: z.object({ pages: z.array(pageListItemSchema) }) },
      },
    },
    async (request) => ({ pages: await listPages(db, request.query) }),
  );

  app.get(
    '/pages/:lang/:slug',
    {
      schema: {
        tags: ['pages'],
        summary: 'One page with its current content and sponsored offers',
        params: pageParams,
        response: { 200: pageSchema, 404: errorSchema },
      },
    },
    async (request) => getPage(db, request.params.lang, request.params.slug),
  );

  app.put(
    '/pages/:lang/:slug',
    {
      config: editRateLimit,
      schema: {
        tags: ['pages'],
        summary: 'Create a page or save a new revision',
        description:
          'Send the id of the revision you edited as baseRevisionId. When the page changed in the meantime ' +
          'the API answers 409 edit_conflict. Send null to create a page. A human edit publishes a draft.',
        params: pageParams,
        body: z.object({
          title: titleSchema,
          content: pageContentSchema,
          editSummary: z.string().trim().max(300).default(''),
          baseRevisionId: z.uuid().nullable(),
        }),
        response: { 200: pageSchema, 201: pageSchema, 401: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { lang, slug } = request.params;
      const content = { ...request.body.content };
      if (content.image) {
        // Size and the AI label come from the stored image, never from the client.
        const asset = await getAssetMeta(db, content.image.assetId);
        if (!asset) throw badRequest('unknown_image', 'This image does not exist');
        content.image = { ...content.image, width: asset.width, height: asset.height, ai: asset.source === 'ai' };
      }
      const { created } = await saveRevision(db, {
        lang,
        slug,
        ...request.body,
        content,
        authorId: user.id,
        source: 'human',
      });
      await cache.purgePage(lang, slug);
      return reply.code(created ? 201 : 200).send(await getPage(db, lang, slug));
    },
  );

  app.post(
    '/pages/:lang/:slug/publish',
    {
      config: editRateLimit,
      schema: {
        tags: ['pages'],
        summary: 'Approve an LLM draft without changes',
        params: pageParams,
        response: { 200: pageSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const { lang, slug } = request.params;
      await publishPage(db, lang, slug, user.id);
      await cache.purgePage(lang, slug);
      return getPage(db, lang, slug);
    },
  );

  app.get(
    '/pages/:lang/:slug/revisions',
    {
      schema: {
        tags: ['revisions'],
        summary: 'Revision history, newest first',
        params: pageParams,
        response: { 200: z.object({ revisions: z.array(revisionSummarySchema) }), 404: errorSchema },
      },
    },
    async (request) => ({ revisions: await listRevisions(db, request.params.lang, request.params.slug) }),
  );

  app.get(
    '/pages/:lang/:slug/revisions/:number',
    {
      schema: {
        tags: ['revisions'],
        summary: 'One revision with its full content',
        params: pageParams.extend({ number: z.coerce.number().int().min(1) }),
        response: { 200: revisionSchema, 404: errorSchema },
      },
    },
    async (request) => getRevision(db, request.params.lang, request.params.slug, request.params.number),
  );

  app.post(
    '/pages/:lang/:slug/revert',
    {
      config: editRateLimit,
      schema: {
        tags: ['revisions'],
        summary: 'Restore an older revision as a new revision',
        params: pageParams,
        body: z.object({
          number: z.number().int().min(1),
          editSummary: z.string().trim().max(300).optional(),
        }),
        response: { 200: pageSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const { lang, slug } = request.params;
      await revertPage(db, { lang, slug, ...request.body, userId: user.id });
      await cache.purgePage(lang, slug);
      return getPage(db, lang, slug);
    },
  );

  app.get(
    '/resolve/:slug',
    {
      schema: {
        tags: ['pages'],
        summary: 'Pick the best language for a slug, used for subdomains like water.is.gratis',
        description: 'Uses the Accept-Language header to choose among the languages the slug exists in.',
        params: z.object({ slug: slugSchema }),
        response: {
          200: z.object({ lang: languageSchema, slug: z.string(), exists: z.boolean() }),
        },
      },
    },
    async (request) => {
      const { slug } = request.params;
      const available = await languagesForSlug(db, slug);
      const accept = request.headers['accept-language'];
      if (available.length === 0) return { lang: pickLanguage(accept, LANGUAGES), slug, exists: false };
      return { lang: pickLanguage(accept, available, available[0]), slug, exists: true };
    },
  );

  app.get(
    '/sitemap',
    {
      schema: {
        tags: ['pages'],
        summary: 'All published pages with their topic, for the XML sitemap',
        response: {
          200: z.object({
            entries: z.array(
              z.object({ lang: languageSchema, slug: z.string(), updatedAt: z.string(), topicKey: z.string() }),
            ),
          }),
        },
      },
    },
    async () => ({ entries: await sitemapEntries(db) }),
  );
};
