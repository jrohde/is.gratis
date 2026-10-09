/**
 * Builds the Fastify application. Kept free of process concerns (ports, signals, migrations)
 * so tests can create an app per test file with fastify.inject.
 */
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { authPlugin, registerOriginCheck } from './auth.js';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import type { CacheInvalidator } from './lib/cache.js';
import { HttpError } from './lib/errors.js';
import { assetRoutes } from './routes/assets.js';
import { authRoutes } from './routes/auth.js';
import { communityRoutes } from './routes/community.js';
import { draftRoutes } from './routes/drafts.js';
import { healthRoutes } from './routes/health.js';
import { mcpRoutes } from './routes/mcp.js';
import { ogRoutes } from './routes/og.js';
import { pageRoutes } from './routes/pages.js';
import { regionRoutes } from './routes/regions.js';
import { reportRoutes } from './routes/reports.js';
import { reviewRoutes } from './routes/review.js';
import { searchRoutes } from './routes/search.js';
import { translationRoutes } from './routes/translations.js';
import { sponsorRoutes } from './routes/sponsors.js';

export interface AppDeps {
  config: Config;
  db: Database;
  cache: CacheInvalidator;
  /** A pino logger shared with other components; defaults to a new one at config.logLevel. */
  logger?: FastifyBaseLogger;
}

export async function buildApp({ config, db, cache, logger }: AppDeps) {
  const app = Fastify({
    ...(logger ? { loggerInstance: logger } : { logger: { level: config.logLevel } }),
    // The API runs behind the ingress and Varnish; take the client IP from X-Forwarded-For.
    // A number means "trust that many hops", like proxy-addr: hop 0 is the socket peer.
    trustProxy:
      typeof config.trustProxy === 'number'
        ? (_address: string, hop: number) => hop < (config.trustProxy as number)
        : config.trustProxy,
    bodyLimit: 256 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issue = error.validation[0];
      const field = issue?.instancePath?.replace(/^\//, '').replace(/\//g, '.') || error.validationContext;
      return reply.code(400).send({
        error: 'validation',
        message: `${field ? `${field}: ` : ''}${issue?.message ?? 'Invalid request'}`,
        issues: error.validation,
      });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause.issues }, 'response does not match its schema');
      return reply.code(500).send({ error: 'internal', message: 'Internal server error' });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'internal', message: 'Internal server error' });
    }
    const code = status === 429 ? 'rate_limited' : status === 415 ? 'unsupported_media_type' : 'bad_request';
    return reply.code(status).send({ error: code, message: (error as Error).message });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: 'not_found', message: `No route for ${request.method} ${request.url}` }),
  );

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: true,
  });
  // In-memory per replica. Draft generation, the expensive operation, is limited in Postgres instead.
  await app.register(rateLimit, { global: false });
  registerOriginCheck(app, config.trustedOrigins);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'is.gratis API',
        description: 'The encyclopedia that answers one question: is it free?',
        version: '0.1.0',
      },
      tags: [
        { name: 'pages' },
        { name: 'revisions' },
        { name: 'drafts' },
        { name: 'search' },
        { name: 'regions' },
        { name: 'community' },
        { name: 'auth' },
        { name: 'sponsors' },
        { name: 'assets' },
        { name: 'mcp' },
        { name: 'admin' },
        { name: 'health' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await app.register(authPlugin, { db });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { db });
      await api.register(authRoutes, { db, config });
      await api.register(pageRoutes, { db, cache });
      await api.register(draftRoutes, { db, config });
      await api.register(sponsorRoutes, { db, cache, config });
      await api.register(reviewRoutes, { db, config, cache });
      await api.register(regionRoutes, { db });
      await api.register(searchRoutes, { db, config });
      await api.register(reportRoutes, { db, config });
      await api.register(translationRoutes, { db, config });
      await api.register(communityRoutes, { db, cache });
      await api.register(assetRoutes, { db, config });
      await api.register(ogRoutes, { db });
      await api.register(mcpRoutes, { db, config });
    },
    { prefix: '/api' },
  );

  return app;
}
