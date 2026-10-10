/**
 * Response schemas. They document the API in the OpenAPI spec (served at /api/docs) and the
 * serializer checks every response against them, so the spec cannot drift from reality.
 */
import { z } from 'zod';
import { LANGUAGES } from '@isgratis/types';
import { freeTypeSchema, pageContentSchema, regionSchema, verdictSchema } from './lib/content.js';

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
  source: z.enum(['human', 'llm', 'seed', 'editor']),
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
  protected: z.boolean(),
  content: pageContentSchema,
  currentRevision: revisionSummarySchema,
  sponsoredOffers: z.array(sponsoredOfferSchema),
  sourceChecks: z.record(
    z.string(),
    z.object({ ok: z.boolean(), status: z.number().int().nullable(), checkedAt: z.string() }),
  ),
  commentCount: z.number().int(),
  links: z.object({
    missing: z.array(z.string()),
    resolved: z.record(z.string(), z.string()),
    auto: z.array(z.object({ term: z.string(), slug: z.string() })),
  }),
  translations: z.array(z.object({ lang: languageEnum, slug: z.string(), title: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pageListItemSchema = z.object({
  lang: languageEnum,
  slug: z.string(),
  title: z.string(),
  emoji: z.string().optional(),
  plural: z.boolean().optional(),
  verdict: verdictSchema,
  scale: z.object({ type: freeTypeSchema, region: regionSchema }).optional(),
  status: z.enum(['draft', 'published']),
  summary: z.string(),
  updatedAt: z.string(),
});

export const reviewItemSchema = pageListItemSchema.extend({
  createdAt: z.string(),
  claims: z.number().int(),
  cited: z.number().int(),
  sources: z.number().int(),
  /** Why the editorial model did not publish this draft, if it looked at it. */
  editorNote: z.string().optional(),
});

export const commentSchema = z.object({
  id: z.string(),
  authorName: z.string(),
  body: z.string(),
  hidden: z.boolean(),
  createdAt: z.string(),
});

export const watchItemSchema = z.object({
  lang: languageEnum,
  slug: z.string(),
  title: z.string(),
  emoji: z.string().optional(),
  revision: z.number().int(),
  seenRevision: z.number().int(),
  updatedAt: z.string(),
});

export const regionEntrySchema = z.object({
  lang: languageEnum,
  slug: z.string(),
  title: z.string(),
  emoji: z.string().optional(),
  plural: z.boolean().optional(),
  verdict: verdictSchema,
  text: z.string(),
});

export const sponsorQuoteSchema = z.object({
  views30: z.number().int(),
  priceCents: z.number().int(),
  currency: z.literal('EUR'),
});

export const assetSchema = z.object({
  id: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  source: z.enum(['upload', 'ai']),
});

export const draftJobSchema = z.object({
  id: z.string(),
  kind: z.enum(['page', 'image', 'translation']),
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
  priceCents: z.number().int().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
  editor: z
    .object({
      decision: z.enum(['approve', 'reject', 'unsure']),
      notes: z.string(),
      suggestion: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
      checkedAt: z.string(),
    })
    .nullable(),
});
