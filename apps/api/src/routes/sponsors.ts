import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { httpUrlSchema, languageSchema, regionSchema, slugSchema } from '../lib/content.js';
import { badRequest } from '../lib/errors.js';
import { bookingSchema, bookingStatusSchema, errorSchema, sponsorQuoteSchema } from '../schemas.js';
import { createSponsorRequest, listBookings, reviewBooking } from '../services/sponsors.js';
import { quotePrice, topViewed, viewsLast30Days } from '../services/views.js';

const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[<>]/.test(value), 'Plain text only');

export const sponsorRoutes: FastifyPluginAsyncZod<{ db: Database; cache: CacheInvalidator; config: Config }> = async (
  app,
  { db, cache, config },
) => {
  const quote = async (lang: Parameters<typeof viewsLast30Days>[1], slug: string) => {
    const views30 = await viewsLast30Days(db, lang, slug);
    return { views30, priceCents: quotePrice(views30, config.sponsorPricing), currency: 'EUR' as const };
  };

  app.get(
    '/sponsors/quote',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Monthly price of a sponsored spot on a page',
        description: 'A base price plus a price per thousand views in the last 30 days.',
        querystring: z.object({ lang: languageSchema, slug: slugSchema }),
        response: { 200: sponsorQuoteSchema },
      },
    },
    async (request) => quote(request.query.lang, request.query.slug),
  );

  app.get(
    '/admin/views',
    {
      schema: {
        tags: ['admin'],
        summary: 'Most viewed pages in the last 30 days (admin)',
        querystring: z.object({
          lang: languageSchema.optional(),
          limit: z.coerce.number().int().min(1).max(500).default(50),
        }),
        response: {
          200: z.object({
            pages: z.array(
              z.object({
                lang: languageSchema,
                slug: z.string(),
                title: z.string(),
                views30: z.number().int(),
                priceCents: z.number().int(),
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
      const rows = await topViewed(db, request.query.limit, request.query.lang);
      return { pages: rows.map((row) => ({ ...row, priceCents: quotePrice(row.views30, config.sponsorPricing) })) };
    },
  );

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
        response: {
          201: z.object({ id: z.string(), status: bookingStatusSchema, priceCents: z.number().int() }),
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // The price is fixed when the request comes in, so the advertiser pays what they were shown.
      const { priceCents } = await quote(request.body.lang, request.body.slug);
      const booking = await createSponsorRequest(db, { ...request.body, priceCents });
      request.log.info({ bookingId: booking.id, lang: booking.lang, slug: booking.slug }, 'sponsor request received');
      return reply.code(201).send({ id: booking.id, status: booking.status, priceCents: booking.priceCents ?? 0 });
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
