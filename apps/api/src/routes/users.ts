import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import type { Database } from '../db/client.js';
import { badRequest } from '../lib/errors.js';
import { errorSchema } from '../schemas.js';
import { listUsers, setRole } from '../services/users.js';

const roleSchema = z.enum(['user', 'moderator', 'admin']);

export const userRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/admin/users',
    {
      schema: {
        tags: ['admin'],
        summary: 'Users, newest first, optionally filtered by name or email (admin)',
        querystring: z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: {
          200: z.object({
            users: z.array(z.object({ id: z.string(), email: z.string(), displayName: z.string(), role: roleSchema, createdAt: z.string() })),
          }),
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      requireRole(request, 'admin');
      reply.header('cache-control', 'private, no-store');
      return { users: await listUsers(db, request.query.q, request.query.limit) };
    },
  );

  app.post(
    '/admin/users/:id/role',
    {
      schema: {
        tags: ['admin'],
        summary: 'Make someone a moderator or admin, or take that away (admin)',
        params: z.object({ id: z.uuid() }),
        body: z.object({ role: roleSchema }),
        response: { 200: z.object({ role: roleSchema }), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const admin = requireRole(request, 'admin');
      // An admin cannot lock themselves out by accident.
      if (request.params.id === admin.id) throw badRequest('own_role', 'You cannot change your own role');
      await setRole(db, request.params.id, request.body.role);
      request.log.info({ userId: request.params.id, role: request.body.role, by: admin.id }, 'role changed');
      return { role: request.body.role };
    },
  );
};
