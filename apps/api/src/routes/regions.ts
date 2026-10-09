import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { languageSchema, regionSchema } from '../lib/content.js';
import { regionEntrySchema } from '../schemas.js';
import { regionCounts, regionEntries } from '../services/regions.js';
import { dailyPick, quizQuestions } from '../services/daily.js';
import { pageListItemSchema } from '../schemas.js';

export const regionRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/regions',
    {
      schema: {
        tags: ['regions'],
        summary: 'How many pages say something about each country or area',
        querystring: z.object({ lang: languageSchema }),
        response: { 200: z.object({ counts: z.record(z.string(), z.number().int()) }) },
      },
    },
    async (request) => ({ counts: await regionCounts(db, request.query.lang) }),
  );

  app.get(
    '/regions/:region',
    {
      schema: {
        tags: ['regions'],
        summary: 'What is free in one country or area: every page with a regional answer for it',
        params: z.object({ region: z.string().toUpperCase().pipe(regionSchema) }),
        querystring: z.object({ lang: languageSchema }),
        response: { 200: z.object({ region: regionSchema, pages: z.array(regionEntrySchema) }) },
      },
    },
    async (request) => ({
      region: request.params.region,
      pages: await regionEntries(db, request.params.region, request.query.lang),
    }),
  );

  app.get(
    '/daily',
    {
      schema: {
        tags: ['pages'],
        summary: 'Free thing of the day: one subject per day, the same for everyone',
        querystring: z.object({ lang: languageSchema }),
        response: { 200: z.object({ day: z.string(), page: pageListItemSchema.nullable() }) },
      },
    },
    async (request) => {
      const day = new Date().toISOString().slice(0, 10);
      return { day, page: await dailyPick(db, request.query.lang, day) };
    },
  );

  app.get(
    '/quiz',
    {
      schema: {
        tags: ['pages'],
        summary: 'Random subjects with a free scale, for the "is it free?" quiz',
        querystring: z.object({ lang: languageSchema, count: z.coerce.number().int().min(1).max(20).default(10) }),
        response: { 200: z.object({ questions: z.array(pageListItemSchema) }) },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      return { questions: await quizQuestions(db, request.query.lang, request.query.count) };
    },
  );
};
