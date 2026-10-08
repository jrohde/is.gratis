import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from '../auth.js';
import { errorSchema, userSchema } from '../schemas.js';
import { authenticate, createSession, deleteSession, registerUser } from '../services/users.js';

const credentials = {
  email: z.email().max(254),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
};
const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export const authRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  app.post(
    '/auth/register',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Create an account and log in',
        body: z.object({ ...credentials, displayName: z.string().trim().min(2).max(40) }),
        response: { 201: z.object({ user: userSchema }), 409: errorSchema },
      },
    },
    async (request, reply) => {
      const user = await registerUser(db, request.body, config.adminEmails);
      const session = await createSession(db, user.id, config.sessionTtlDays);
      setSessionCookie(reply, config, session.token, session.expiresAt);
      return reply.code(201).send({ user });
    },
  );

  app.post(
    '/auth/login',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Log in',
        body: z.object({ email: credentials.email, password: z.string().min(1).max(200) }),
        response: { 200: z.object({ user: userSchema }), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const user = await authenticate(db, request.body.email, request.body.password);
      const session = await createSession(db, user.id, config.sessionTtlDays);
      setSessionCookie(reply, config, session.token, session.expiresAt);
      return { user };
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'Log out', response: { 204: z.null() } } },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) await deleteSession(db, token);
      clearSessionCookie(reply, config);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'The logged in user, or null',
        response: { 200: z.object({ user: userSchema.nullable() }) },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      return { user: request.user };
    },
  );
};
