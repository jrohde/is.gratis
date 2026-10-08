import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { languageSchema, slugSchema } from '../lib/content.js';
import { badRequest, HttpError, notFound } from '../lib/errors.js';
import { hashIp } from '../lib/hash.js';
import { ACCEPTED_TYPES, IMAGE_WIDTHS, MAX_UPLOAD_BYTES, normalizeImage, resizeImage } from '../lib/images.js';
import { assetSchema, draftJobSchema, errorSchema } from '../schemas.js';
import { getAssetBytes, storeAsset } from '../services/assets.js';
import { enqueueImage } from '../services/drafts.js';

const IMMUTABLE = 'public, max-age=31536000, immutable';

export const assetRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config }> = async (app, { db, config }) => {
  // Image uploads arrive as the raw file body, e.g. fetch('/api/assets', { body: file }).
  app.addContentTypeParser(ACCEPTED_TYPES, { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_request, body, done) =>
    done(null, body),
  );

  app.get(
    '/config',
    {
      schema: {
        tags: ['assets'],
        summary: 'Features the web app can offer',
        response: { 200: z.object({ imageGeneration: z.boolean() }) },
      },
    },
    async () => ({ imageGeneration: config.images.enabled }),
  );

  app.post(
    '/assets',
    {
      bodyLimit: MAX_UPLOAD_BYTES,
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
      schema: {
        tags: ['assets'],
        summary: 'Upload an image (raw body: PNG, JPEG, WebP, GIF or AVIF, at most 10 MB)',
        description: 'The image is checked, stripped of metadata, scaled to at most 1600 pixels and stored as WebP.',
        response: { 201: z.object({ asset: assetSchema }), 400: errorSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw badRequest('invalid_image', `Send the image as the request body with one of: ${ACCEPTED_TYPES.join(', ')}`);
      }
      const image = await normalizeImage(request.body);
      const asset = await storeAsset(db, image, { source: 'upload', createdBy: user.id });
      return reply.code(201).send({ asset });
    },
  );

  app.get(
    '/media/:file',
    {
      schema: {
        tags: ['assets'],
        summary: 'An image as WebP; ?w= picks a smaller width',
        params: z.object({ file: z.string().regex(/^[0-9a-f-]{36}\.webp$/) }),
        querystring: z.object({ w: z.coerce.number().int().optional() }),
      },
    },
    async (request, reply) => {
      const id = request.params.file.slice(0, 36);
      const width = request.query.w;
      if (width !== undefined && !(IMAGE_WIDTHS as readonly number[]).includes(width)) {
        throw badRequest('invalid_width', `w must be one of ${IMAGE_WIDTHS.join(', ')}`);
      }
      const bytes = await getAssetBytes(db, id).catch(() => null);
      if (!bytes) {
        reply.header('cache-control', 'public, max-age=60');
        throw notFound('Image not found');
      }
      const body = width ? await resizeImage(bytes, width) : bytes;
      return reply.header('content-type', 'image/webp').header('cache-control', IMMUTABLE).send(body);
    },
  );

  app.post(
    '/images/generate',
    {
      schema: {
        tags: ['assets'],
        summary: 'Generate an illustration for a page with the configured image model',
        description: 'Returns a job; poll GET /api/drafts/{id}. The finished job carries the image.',
        body: z.object({ lang: languageSchema, slug: slugSchema }),
        response: { 200: z.object({ job: draftJobSchema }), 202: z.object({ job: draftJobSchema }), 401: errorSchema, 404: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      if (!config.images.enabled) throw new HttpError(404, 'image_generation_disabled', 'Image generation is not configured');
      const { job, created } = await enqueueImage(
        db,
        { ...request.body, userId: user.id, ipHash: hashIp(request.ip, config.ipHashSalt), attach: false },
        config.images,
      );
      return reply.code(created ? 202 : 200).send({ job });
    },
  );
};
