/**
 * Session handling. The session token lives in an httpOnly cookie that is shared by every
 * subdomain when COOKIE_DOMAIN is ".is.gratis". Only its hash is stored in the database.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { User, UserRole } from '@isgratis/types';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { forbidden, unauthorized } from './lib/errors.js';
import { userForSession } from './services/users.js';

export const SESSION_COOKIE = 'isg_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export const authPlugin = fp<{ db: Database }>(async (app, { db }) => {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.user = token ? await userForSession(db, token) : null;
  });
});

export function requireUser(request: FastifyRequest): User {
  if (!request.user) throw unauthorized();
  return request.user;
}

const ROLE_RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2 };

export function requireRole(request: FastifyRequest, role: UserRole): User {
  const user = requireUser(request);
  if (ROLE_RANK[user.role] < ROLE_RANK[role]) throw forbidden();
  return user;
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    domain: config.cookieDomain,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', domain: config.cookieDomain });
}

/**
 * Rejects state-changing requests from foreign origins. Together with SameSite=Lax cookies
 * and JSON-only bodies this covers CSRF without tokens.
 */
export function registerOriginCheck(app: FastifyInstance, trustedOrigins: string[]) {
  if (trustedOrigins.length === 0) return;
  const matchers = trustedOrigins.map((origin) => {
    if (origin.includes('*')) {
      // "https://*.is.gratis" matches any single subdomain label.
      const escaped = origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped.replace(/\*/g, '[a-z0-9-]+')}$`);
      return (value: string) => regex.test(value);
    }
    return (value: string) => value === origin;
  });
  app.addHook('onRequest', async (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !matchers.some((match) => match(origin))) throw forbidden();
  });
}
