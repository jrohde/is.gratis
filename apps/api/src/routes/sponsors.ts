import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { httpUrlSchema, languageSchema, regionSchema, slugSchema } from '../lib/content.js';
import { badRequest } from '../lib/errors.js';
import { bookingSchema, bookingStatusSchema, errorSchema } from '../schemas.js';
import { createSponsorRequest, listBookings, reviewBooking } from '../services/sponsors.js';

const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[<>]/.test(value), 'Plain text only');

export const sponsorRoutes: FastifyPluginAsyncZod<{ db: Database; cache: CacheInvalidator }> = async (
  app,
  { db, cache },
) => {
  app.post(
    '/sponsors/requests',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Request a sponsored spot on a page',
        description: 'Requests are reviewed by hand. The offer must be genuinely free for the visitor.',
        body: z.object({
          lang: languageSchema,
          slug: slugSchema,
          region: regionSchema.nullable().default(null),
          advertiserName: plain(80),
          contactEmail: z.email().max(254),
          title: plain(80),
          description: plain(280),
          url: httpUrlSchema,
          message: z.string().trim().max(2000).optional(),
        }),
        response: { 201: z.object({ id: z.string(), status: bookingStatusSchema }), 429: errorSchema },
      },
    },
    async (request, reply) => {
      const booking = await createSponsorRequest(db, request.body);
      request.log.info({ bookingId: booking.id, lang: booking.lang, slug: booking.slug }, 'sponsor request received');
      return reply.code(201).send({ id: booking.id, status: booking.status });
    },
  );

  app.get(
    '/admin/sponsors',
    {
      schema: {
        tags: ['admin'],
        summary: 'All sponsor bookings (admin)',
        querystring: z.object({ status: bookingStatusSchema.optional() }),
        response: { 200: z.object({ bookings: z.array(bookingSchema) }), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request, reply) => {
      requireRole(request, 'admin');
      reply.header('cache-control', 'private, no-store');
      return { bookings: await listBookings(db, request.query.status) };
    },
  );

  app.post(
    '/admin/sponsors/:id/review',
    {
      schema: {
        tags: ['admin'],
        summary: 'Approve, reject or end a booking (admin)',
        params: z.object({ id: z.uuid() }),
        body: z.object({
          status: bookingStatusSchema,
          startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
          endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
        }),
        response: { 200: z.object({ booking: bookingSchema }), 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (request) => {
      const reviewer = requireRole(request, 'admin');
      const startsAt = request.body.startsAt ? new Date(request.body.startsAt) : null;
      const endsAt = request.body.endsAt ? new Date(request.body.endsAt) : null;
      if (startsAt && endsAt && endsAt <= startsAt) throw badRequest('invalid_period', 'The end must be after the start');
      const booking = await reviewBooking(db, request.params.id, {
        status: request.body.status,
        startsAt,
        endsAt,
        reviewerId: reviewer.id,
      });
      await cache.purgePage(booking.lang, booking.slug);
      return { booking };
    },
  );
};
