/**
 * Response schemas. They document the API in the OpenAPI spec (served at /api/docs) and the
 * serializer checks every response against them, so the spec cannot drift from reality.
 */
import { z } from 'zod';
import { LANGUAGES } from '@isgratis/types';
import { pageContentSchema, regionSchema, verdictSchema } from './lib/content.js';

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(['user', 'moderator', 'admin']),
});

export const revisionSummarySchema = z.object({
  id: z.string(),
  number: z.number().int(),
  editSummary: z.string(),
  source: z.enum(['human', 'llm', 'seed']),
  authorName: z.string().nullable(),
  createdAt: z.string(),
});

export const revisionSchema = revisionSummarySchema.extend({
  title: z.string(),
  content: pageContentSchema,
});

export const sponsoredOfferSchema = z.object({
  id: z.string(),
  advertiserName: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  region: regionSchema.nullable(),
});

const languageEnum = z.enum(LANGUAGES);

export const pageSchema = z.object({
  id: z.string(),
  topicKey: z.string(),
  lang: languageEnum,
  slug: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  content: pageContentSchema,
  currentRevision: revisionSummarySchema,
  sponsoredOffers: z.array(sponsoredOfferSchema),
  translations: z.array(z.object({ lang: languageEnum, slug: z.string(), title: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pageListItemSchema = z.object({
  lang: languageEnum,
  slug: z.string(),
  title: z.string(),
  emoji: z.string().optional(),
  verdict: verdictSchema,
  status: z.enum(['draft', 'published']),
  summary: z.string(),
  updatedAt: z.string(),
});

export const assetSchema = z.object({
  id: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  source: z.enum(['upload', 'ai']),
});

export const draftJobSchema = z.object({
  id: z.string(),
  kind: z.enum(['page', 'image']),
  asset: assetSchema.nullable(),
  lang: languageEnum,
  slug: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const bookingStatusSchema = z.enum(['pending', 'active', 'rejected', 'expired']);

export const bookingSchema = sponsoredOfferSchema.extend({
  lang: languageEnum,
  slug: z.string(),
  contactEmail: z.string(),
  message: z.string().nullable(),
  status: bookingStatusSchema,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
});
