import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client.js';

export const healthRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/health',
    { schema: { tags: ['health'], summary: 'Liveness probe', response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => ({ status: 'ok' as const }),
  );

  app.get(
    '/ready',
    { schema: { tags: ['health'], summary: 'Readiness probe, checks the database', response: { 200: z.object({ status: z.literal('ready') }) } } },
    async () => {
      await db.execute(sql`select 1`);
      return { status: 'ready' as const };
    },
  );
};
