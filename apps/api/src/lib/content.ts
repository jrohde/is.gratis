/**
 * Validation for page content. Used for API request bodies and for LLM output, so a model
 * can never store anything a human editor could not.
 */
import { z } from 'zod';
import { FREE_TYPES, LANGUAGES, REGIONS, SOURCE_ID, VERDICTS, isValidSlug, unknownCitations, withSourceIds } from '@isgratis/types';

export const languageSchema = z.enum(LANGUAGES);
export const verdictSchema = z.enum(VERDICTS);
export const regionSchema = z.enum(REGIONS);
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidSlug, 'Use lowercase letters, digits and single hyphens');

const markdown = (max: number) =>
  z
    .string()
    .max(max)
    // Raw HTML is never rendered, but keep it out of the store as well.
    .refine((value) => !/<\s*\/?\s*[a-z][^>]*>/i.test(value), 'HTML is not allowed, use Markdown');

export const httpUrlSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Must be an http(s) URL');

export const regionBlockSchema = z.object({
  region: regionSchema,
  verdict: verdictSchema,
  text: markdown(3000).min(1),
});

/** A link to a source, as used by a time price. */
export const sourceLinkSchema = z.object({
  title: z.string().min(1).max(200),
  url: httpUrlSchema,
});

/** A page source; claims cite it with [^id]. The id is derived from the title when missing. */
export const sourceSchema = sourceLinkSchema.extend({
  id: z.string().regex(SOURCE_ID, 'Use lowercase letters, digits and hyphens').optional(),
});

export const freeTypeSchema = z.enum(FREE_TYPES);

const plainLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[<>]/.test(value) && !value.includes('\n'), 'One line of plain text');

export const factSchema = z.object({
  label: plainLine(80),
  value: plainLine(200),
  sourceUrl: httpUrlSchema.optional(),
});

export const timePriceSchema = z.object({
  unit: plainLine(80),
  price: z.number().min(0).max(1e9),
  hourlyWage: z.number().positive().max(1e6),
  currency: z.string().regex(/^[A-Z]{3}$/),
  region: regionSchema,
  source: sourceLinkSchema,
});

export const pageImageSchema = z.object({
  assetId: z.uuid(),
  alt: plainLine(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  credit: plainLine(200).optional(),
  ai: z.boolean(),
});

export const pageContentSchema = z
  .object({
    verdict: verdictSchema,
    // One emoji, possibly with modifiers or a zero-width joiner sequence.
    emoji: z
      .string()
      .max(16)
      .refine((value) => /^\p{Extended_Pictographic}/u.test(value) && !/[\p{L}\p{N}]/u.test(value), 'One emoji')
      .optional(),
    plural: z.boolean().optional(),
    summary: markdown(600).min(1),
    whenFree: markdown(5000),
    whenNotFree: markdown(5000),
    // Fields added later default to empty, so older clients and revisions stay valid.
    background: markdown(8000).default(''),
    scale: z.object({ type: freeTypeSchema, region: regionSchema }).optional(),
    timePrice: timePriceSchema.optional(),
    facts: z.array(factSchema).max(12).default([]),
    trivia: z.array(markdown(300).min(1)).max(10).default([]),
    regions: z.array(regionBlockSchema).max(30),
    sources: z.array(sourceSchema).max(20),
    image: pageImageSchema.optional(),
  })
  .refine(
    (content) => new Set(content.regions.map((block) => block.region)).size === content.regions.length,
    { message: 'Each region may appear only once', path: ['regions'] },
  )
  .refine((content) => new Set(content.sources.flatMap((s) => (s.id ? [s.id] : []))).size === content.sources.filter((s) => s.id).length, {
    message: 'Each source id may appear only once',
    path: ['sources'],
  })
  .superRefine((content, ctx) => {
    const unknown = unknownCitations({ ...content, sources: withSourceIds(content.sources) });
    if (unknown.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: `Citations to unknown sources: ${unknown.map((id) => `[^${id}]`).join(', ')}`,
      });
    }
  });

export const titleSchema = z.string().trim().min(1).max(120);
