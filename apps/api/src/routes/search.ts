import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema } from '../lib/content.js';
import { pageListItemSchema } from '../schemas.js';
import { recordMiss, related, searchFull, suggest, wantedSubjects } from '../services/search.js';

const missingSchema = z.object({
  slug: z.string(),
  title: z.string(),
  reason: z.enum(['wanted', 'searched', 'translation', 'starter', 'related', 'typed']),
});
const suggestionsSchema = z.object({ pages: z.array(pageListItemSchema), missing: z.array(missingSchema) });
const query = z.string().trim().min(1).max(80);

export const searchRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  app.get(
    '/search/full',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['search'],
        summary: 'Full-text search in all text of all pages, with highlighted fragments',
        description:
          'Uses the stemming of each language, so "musea" also finds "museum". Quotes search for a phrase, ' +
          'a minus sign excludes a word, "or" gives alternatives. Searches that find nothing are counted ' +
          'anonymously and become suggestions for new pages.',
        querystring: z.object({
          lang: languageSchema,
          q: query,
          limit: z.coerce.number().int().min(1).max(50).default(20),
          offset: z.coerce.number().int().min(0).max(1000).default(0),
        }),
        response: {
          200: z.object({
            query: z.string(),
            results: z.array(pageListItemSchema.extend({ snippet: z.string() })),
            total: z.number().int(),
            didYouMean: pageListItemSchema.nullable(),
            exact: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { lang, q, limit, offset } = request.query;
      const response = await searchFull(db, lang, q, { limit, offset });
      if (response.total === 0 && offset === 0) await recordMiss(db, lang, q);
      return response;
    },
  );

  app.get(
    '/suggest',
    {
      schema: {
        tags: ['search'],
        summary: 'As-you-type suggestions: existing pages, then subjects that have no page yet',
        querystring: z.object({ lang: languageSchema, q: query }),
        response: { 200: suggestionsSchema },
      },
    },
    async (request) => suggest(db, request.query.lang, request.query.q),
  );

  app.get(
    '/search/related',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['search'],
        summary: 'Subjects related to a query, suggested by the language model once and then cached',
        querystring: z.object({ lang: languageSchema, q: query }),
        response: { 200: suggestionsSchema },
      },
    },
    async (request) => related(db, config, request.query.lang, request.query.q),
  );

  app.get(
    '/wanted',
    {
      schema: {
        tags: ['search'],
        summary: 'Subjects without a page, most wanted first: linked from other pages, searched, or in another language',
        querystring: z.object({ lang: languageSchema, limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: z.object({ subjects: z.array(missingSchema.extend({ weight: z.number() })) }) },
      },
    },
    async (request) => ({ subjects: await wantedSubjects(db, request.query.lang, request.query.limit) }),
  );
};
