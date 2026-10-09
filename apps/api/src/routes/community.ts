/** Watchlist, talk pages and page views. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole, requireUser } from '../auth.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { languageSchema, slugSchema } from '../lib/content.js';
import { commentSchema, errorSchema, watchItemSchema } from '../schemas.js';
import {
  addComment,
  isWatching,
  listComments,
  setCommentHidden,
  unwatchPage,
  watchlist,
  watchPage,
} from '../services/community.js';
import { recordView } from '../services/views.js';
import { pages } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const pageParams = z.object({ lang: languageSchema, slug: slugSchema });
const PRIVATE = 'private, no-store';

export const communityRoutes: FastifyPluginAsyncZod<{ db: Database; cache: CacheInvalidator }> = async (
  app,
  { db, cache },
) => {
  app.post(
    '/views',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['pages'],
        summary: 'Count one view of a page',
        description: 'Sent by the browser once per page view. No cookies and no IP addresses are stored.',
        body: pageParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await recordView(db, request.body.lang, request.body.slug);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/watchlist',
    {
      schema: {
        tags: ['community'],
        summary: 'Pages you follow, changed ones first',
        response: { 200: z.object({ pages: z.array(watchItemSchema) }), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      reply.header('cache-control', PRIVATE);
      return { pages: await watchlist(db, user.id) };
    },
  );

  app.get(
    '/pages/:lang/:slug/watch',
    {
      schema: {
        tags: ['community'],
        summary: 'Whether you follow this page',
        params: pageParams,
        response: { 200: z.object({ watching: z.boolean() }) },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', PRIVATE);
      if (!request.user) return { watching: false };
      return { watching: await isWatching(db, request.user.id, request.params.lang, request.params.slug) };
    },
  );

  app.put(
    '/pages/:lang/:slug/watch',
    {
      schema: {
        tags: ['community'],
        summary: 'Follow a page, or mark its latest version as seen',
        params: pageParams,
        response: { 200: z.object({ watching: z.boolean() }), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      await watchPage(db, user.id, request.params.lang, request.params.slug);
      return { watching: true };
    },
  );

  app.delete(
    '/pages/:lang/:slug/watch',
    {
      schema: {
        tags: ['community'],
        summary: 'Stop following a page',
        params: pageParams,
        response: { 200: z.object({ watching: z.boolean() }), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const user = requireUser(request);
      await unwatchPage(db, user.id, request.params.lang, request.params.slug);
      return { watching: false };
    },
  );

  app.get(
    '/pages/:lang/:slug/comments',
    {
      schema: {
        tags: ['community'],
        summary: 'The talk page: discussion about this page',
        description: 'Moderators also see hidden messages.',
        params: pageParams,
        response: { 200: z.object({ comments: z.array(commentSchema) }), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const moderator = request.user?.role === 'moderator' || request.user?.role === 'admin';
      if (moderator) reply.header('cache-control', PRIVATE);
      return { comments: await listComments(db, request.params.lang, request.params.slug, moderator) };
    },
  );

  app.post(
    '/pages/:lang/:slug/comments',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        tags: ['community'],
        summary: 'Post a message on the talk page',
        params: pageParams,
        body: z.object({ body: z.string().trim().min(2).max(4000) }),
        response: { 201: z.object({ comment: commentSchema }), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { lang, slug } = request.params;
      const row = await addComment(db, user.id, lang, slug, request.body.body);
      await cache.purgePage(lang, slug);
      return reply.code(201).send({
        comment: {
          id: row.id,
          authorName: user.displayName,
          body: row.body,
          hidden: row.hidden,
          createdAt: row.createdAt.toISOString(),
        },
      });
    },
  );

  app.post(
    '/comments/:id/hide',
    {
      schema: {
        tags: ['community'],
        summary: 'Hide or show a talk page message (moderator)',
        params: z.object({ id: z.uuid() }),
        body: z.object({ hidden: z.boolean() }),
        response: { 200: z.object({ hidden: z.boolean() }), 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      requireRole(request, 'moderator');
      const row = await setCommentHidden(db, request.params.id, request.body.hidden);
      const [page] = await db.select({ lang: pages.lang, slug: pages.slug }).from(pages).where(eq(pages.id, row.pageId));
      if (page) await cache.purgePage(page.lang, page.slug);
      return { hidden: row.hidden };
    },
  );
};
