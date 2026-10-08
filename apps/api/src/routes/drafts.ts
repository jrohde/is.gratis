import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema, slugSchema } from '../lib/content.js';
import { hashIp } from '../lib/hash.js';
import { draftJobSchema, errorSchema } from '../schemas.js';
import { enqueueDraft, getJob, openJobFor } from '../services/drafts.js';

export const draftRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  app.post(
    '/drafts',
    {
      schema: {
        tags: ['drafts'],
        summary: 'Ask the LLM to write the first version of a page that does not exist yet',
        description:
          'Rate limited per IP and globally. The page appears as a draft, marked as unchecked and not indexed, ' +
          'until a logged in user publishes or edits it.',
        body: z.object({ lang: languageSchema, slug: slugSchema }),
        response: {
          200: z.object({ job: draftJobSchema }),
          202: z.object({ job: draftJobSchema }),
          409: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { job, created } = await enqueueDraft(
        db,
        { ...request.body, ipHash: hashIp(request.ip, config.ipHashSalt), userId: request.user?.id ?? null },
        config.drafts,
      );
      return reply.code(created ? 202 : 200).send({ job });
    },
  );

  app.get(
    '/drafts',
    {
      schema: {
        tags: ['drafts'],
        summary: 'The latest draft job for a page address, if any',
        querystring: z.object({ lang: languageSchema, slug: slugSchema }),
        response: { 200: z.object({ job: draftJobSchema.nullable() }) },
      },
    },
    async (request) => ({ job: await openJobFor(db, request.query.lang, request.query.slug) }),
  );

  app.get(
    '/drafts/:id',
    {
      schema: {
        tags: ['drafts'],
        summary: 'Status of a draft job',
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ job: draftJobSchema }), 404: errorSchema },
      },
    },
    async (request) => ({ job: await getJob(db, request.params.id) }),
  );
};
