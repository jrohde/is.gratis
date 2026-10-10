import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Region } from '@isgratis/types';
import { requireRole } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { httpUrlSchema, languageSchema, regionSchema, slugSchema } from '../lib/content.js';
import { badRequest } from '../lib/errors.js';
import { bookingSchema, bookingStatusSchema, errorSchema, sponsoredOfferSchema, sponsorQuoteSchema } from '../schemas.js';
import {
  activeOffersOverview,
  clickOffer,
  createSponsorRequest,
  listBookings,
  recordImpressions,
  renewFromToken,
  reviewBooking,
  exclusivePrice,
  slotsFree,
  statsForToken,
} from '../services/sponsors.js';
import { mailRequestReceived } from '../services/advertisers.js';
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
  const quote = async (lang: Parameters<typeof viewsLast30Days>[1], slug: string, region: Region | null = null) => {
    const views30 = await viewsLast30Days(db, lang, slug);
    const priceCents = quotePrice(views30, config.sponsorPricing);
    const slots = await slotsFree(db, lang, slug, region);
    return {
      views30,
      priceCents,
      mailingPriceCents: config.sponsorPricing.mailingCents,
      slotsFree: slots.free,
      exclusivePriceCents: exclusivePrice(priceCents, config.sponsorPricing.exclusivePercent),
      exclusiveAvailable: slots.exclusiveAvailable,
      currency: 'EUR' as const,
    };
  };

  app.get(
    '/offers',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Every sponsored free offer running now, with the page it belongs to',
        querystring: z.object({ lang: languageSchema }),
        response: {
          200: z.object({
            offers: z.array(
              sponsoredOfferSchema.extend({
                page: z.object({
                  lang: languageSchema,
                  slug: z.string(),
                  title: z.string(),
                  plural: z.boolean().optional(),
                  emoji: z.string().optional(),
                }),
              }),
            ),
          }),
        },
      },
    },
    async (request) => ({ offers: await activeOffersOverview(db, request.query.lang) }),
  );

  app.post(
    '/offers/impressions',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Count that offers were shown; sent by the browser, no visitor data',
        body: z.object({ ids: z.array(z.uuid()).min(1).max(6) }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await recordImpressions(db, request.body.ids);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/offers/:id/go',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Count a click on an offer and go to it',
        params: z.object({ id: z.uuid() }),
      },
    },
    async (request, reply) => {
      const url = await clickOffer(db, request.params.id);
      reply.header('cache-control', 'no-store');
      if (!url) return reply.code(404).send({ error: 'not_found', message: 'This offer is not running' });
      return reply.redirect(url, 302);
    },
  );

  app.get(
    '/sponsors/stats/:token',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Statistics of one offer, behind the secret link the advertiser received',
        params: z.object({ token: z.string().min(16).max(128) }),
        response: {
          200: z.object({
            offer: z.object({
              lang: languageSchema,
              slug: z.string(),
              title: z.string(),
              advertiserName: z.string(),
              status: bookingStatusSchema,
              priceCents: z.number().int().nullable(),
              startsAt: z.string().nullable(),
              endsAt: z.string().nullable(),
            }),
            days: z.array(z.object({ day: z.string(), impressions: z.number().int(), clicks: z.number().int() })),
            totals: z.object({ impressions: z.number().int(), clicks: z.number().int() }),
          }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      return statsForToken(db, request.params.token);
    },
  );

  app.get(
    '/sponsors/stats/:token/options',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Renewal price, and busier pages the same offer could move to',
        params: z.object({ token: z.string().min(16).max(128) }),
        response: {
          200: z.object({
            current: z.object({ slug: z.string(), views30: z.number().int(), priceCents: z.number().int() }),
            busier: z.array(z.object({ slug: z.string(), title: z.string(), views30: z.number().int(), priceCents: z.number().int() })),
          }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const { offer } = await statsForToken(db, request.params.token);
      const current = await quote(offer.lang, offer.slug);
      const top = await topViewed(db, 20, offer.lang);
      const busier = top
        .filter((page) => page.slug !== offer.slug && page.views30 > current.views30)
        .slice(0, 5)
        .map((page) => ({ slug: page.slug, title: page.title, views30: page.views30, priceCents: quotePrice(page.views30, config.sponsorPricing) }));
      return { current: { slug: offer.slug, views30: current.views30, priceCents: current.priceCents }, busier };
    },
  );

  app.post(
    '/sponsors/stats/:token/renew',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Ask for the same offer again, on the same or a busier page',
        params: z.object({ token: z.string().min(16).max(128) }),
        body: z.object({ slug: slugSchema.optional() }),
        response: { 201: z.object({ statsToken: z.string(), priceCents: z.number().int(), slug: z.string() }), 404: errorSchema, 429: errorSchema },
      },
    },
    async (request, reply) => {
      const renewed = await renewFromToken(db, request.params.token, {
        slug: request.body.slug,
        priceCents: async (lang, slug) => (await quote(lang, slug)).priceCents,
        mailingPriceCents: config.sponsorPricing.mailingCents,
        exclusivePercent: config.sponsorPricing.exclusivePercent,
      });
      request.log.info({ slug: renewed.slug }, 'sponsor renewal requested');
      await mailRequestReceived(db, renewed, config.publicOrigin);
      return reply.code(201).send({ statsToken: renewed.statsToken, priceCents: renewed.priceCents, slug: renewed.slug });
    },
  );

  app.get(
    '/sponsors/quote',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Monthly price of a sponsored spot on a page',
        description: 'A base price plus a price per thousand views in the last 30 days.',
        querystring: z.object({ lang: languageSchema, slug: slugSchema, region: regionSchema.optional() }),
        response: { 200: sponsorQuoteSchema },
      },
    },
    async (request) => quote(request.query.lang, request.query.slug, request.query.region ?? null),
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
          mailing: z.boolean().default(false),
          exclusive: z.boolean().default(false),
        }),
        response: {
          201: z.object({ id: z.string(), status: bookingStatusSchema, priceCents: z.number().int(), statsToken: z.string() }),
          429: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // The price is fixed when the request comes in, so the advertiser pays what they were shown.
      const offered = await quote(request.body.lang, request.body.slug, request.body.region);
      const { mailing, ...body } = request.body;
      const booking = await createSponsorRequest(db, {
        ...body,
        priceCents: body.exclusive ? offered.exclusivePriceCents : offered.priceCents,
        inMailing: mailing,
        mailingPriceCents: mailing ? config.sponsorPricing.mailingCents : null,
      });
      request.log.info({ bookingId: booking.id, lang: booking.lang, slug: booking.slug }, 'sponsor request received');
      await mailRequestReceived(db, { ...booking, statsToken: booking.statsToken }, config.publicOrigin);
      return reply
        .code(201)
        .send({ id: booking.id, status: booking.status, priceCents: booking.priceCents ?? 0, statsToken: booking.statsToken });
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
        description:
          'While the editorial language model is on, activating needs its approval, or override: true.',
        params: z.object({ id: z.uuid() }),
        body: z.object({
          status: bookingStatusSchema,
          startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
          endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
          applySuggestion: z.boolean().default(false),
          override: z.boolean().default(false),
        }),
        response: {
          200: z.object({ booking: bookingSchema }),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
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
        applySuggestion: request.body.applySuggestion,
        override: request.body.override,
        editorRequired: config.editor.enabled,
      });
      if (request.body.override && booking.editor?.decision !== 'approve') request.log.warn({ bookingId: booking.id, userId: reviewer.id }, 'offer activated over the editor');
      await cache.purgePage(booking.lang, booking.slug);
      return { booking };
    },
  );
};
