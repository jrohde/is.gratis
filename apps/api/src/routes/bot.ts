import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { recentRuns } from '../bot/scheduler.js';
import type { Database } from '../db/client.js';
import { errorSchema } from '../schemas.js';

export const botRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/admin/bot',
    {
      schema: {
        tags: ['admin'],
        summary: 'What the bot did recently (admin)',
        response: {
          200: z.object({
            runs: z.array(
              z.object({
                task: z.string(),
                key: z.string(),
                status: z.enum(['running', 'done', 'failed']),
                attempts: z.number().int(),
                detail: z.string().nullable(),
                updatedAt: z.string(),
              }),
            ),
          }),
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      requireRole(request, 'admin');
      reply.header('cache-control', 'private, no-store');
      return { runs: await recentRuns(db, 100) };
    },
  );
};
