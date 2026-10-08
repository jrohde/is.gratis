/**
 * Validation for page content. Used for API request bodies and for LLM output, so a model
 * can never store anything a human editor could not.
 */
import { z } from 'zod';
import { LANGUAGES, REGIONS, VERDICTS, isValidSlug } from '@isgratis/types';

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

export const sourceSchema = z.object({
  title: z.string().min(1).max(200),
  url: httpUrlSchema,
});

export const pageContentSchema = z
  .object({
    verdict: verdictSchema,
    summary: markdown(600).min(1),
    whenFree: markdown(5000),
    whenNotFree: markdown(5000),
    regions: z.array(regionBlockSchema).max(30),
    sources: z.array(sourceSchema).max(20),
  })
  .refine(
    (content) => new Set(content.regions.map((block) => block.region)).size === content.regions.length,
    { message: 'Each region may appear only once', path: ['regions'] },
  );

export const titleSchema = z.string().trim().min(1).max(120);
