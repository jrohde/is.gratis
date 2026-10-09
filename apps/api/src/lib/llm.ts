/**
 * Writes the first version of a page with an LLM.
 *
 * Talks to any OpenAI-compatible chat completions endpoint: OpenAI itself, or a model you host
 * in your own cluster with vLLM, Ollama or llama.cpp. The answer must be JSON and is validated
 * with the same schema as a human edit before anything is stored.
 */
import { z } from 'zod';
import { FREE_TYPES, REGIONS, normalizeContent, type Language, type PageContent } from '@isgratis/types';
import { pageContentSchema, titleSchema } from './content.js';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export type DraftResult =
  | { ok: true; topicKey: string; title: string; content: PageContent }
  | { ok: false; reason: string };

/** Thrown for failures worth retrying (network, timeouts, malformed output). */
export class LlmError extends Error {}

const LANGUAGE_NAMES: Record<Language, string> = {
  nl: 'Dutch',
  en: 'English',
  de: 'German',
  es: 'Spanish',
};

const QUESTION: Record<Language, (subject: string) => string> = {
  nl: (s) => `Is ${s} gratis?`,
  en: (s) => `Is ${s} free?`,
  de: (s) => `Ist ${s} kostenlos?`,
  es: (s) => `¿Es gratis ${s}?`,
};

const llmAnswerSchema = z.union([
  z.object({
    valid: z.literal(false),
    reason: z.string().max(500),
  }),
  z.object({
    valid: z.literal(true),
    topicKey: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    title: titleSchema,
    content: pageContentSchema,
  }),
]);

export function buildMessages(lang: Language, slug: string) {
  const subject = slug.replace(/-/g, ' ');
  const system = `You write pages for is.gratis, an encyclopedia that answers exactly one question per page: is it free?
Pages are honest, factual, neutral and never promotional. Readers rely on them, so accuracy beats completeness.

Write the page in ${LANGUAGE_NAMES[lang]}. Answer with one JSON object and nothing else.

If the subject is not a real thing, product, service or concept someone could ask "is it free?" about
(gibberish, a private person, hateful or sexual content), answer: {"valid": false, "reason": "<short reason in English>"}.

Otherwise answer:
{
  "valid": true,
  "topicKey": "<the subject as a lowercase English slug, e.g. water, public-transport, netflix>",
  "title": "<the subject as written in the middle of a ${LANGUAGE_NAMES[lang]} sentence, e.g. water, openbaar vervoer, Netflix>",
  "content": {
    "verdict": "yes" | "no" | "usually" | "depends",
    "emoji": "<one emoji for the subject>",
    "plural": <true when the title is a plural noun, e.g. "musea", "museums"; otherwise false>,
    "summary": "<one or two sentences that directly answer the question. Do not start with the verdict word (yes, no, usually, it depends): the page shows the verdict separately>",
    "whenFree": "<Markdown: the situations in which it is free>",
    "whenNotFree": "<Markdown: the situations in which it costs money, and roughly what>",
    "background": "<Markdown, one or two short paragraphs: why it is or is not free; the economic, legal or scientific mechanism; well-established research where relevant>",
    "scale": { "type": "<one of: ${FREE_TYPES.join(', ')}>", "region": "<region code the type applies to>" },
    "facts": [ { "label": "<short label>", "value": "<short value>", "sourceUrl": "https://... (optional)" } ],
    "trivia": [ "<one surprising, true sentence>" ],
    "regions": [ { "region": "<code>", "verdict": "...", "text": "<Markdown>" } ],
    "sources": [ { "id": "<short lowercase id, e.g. drinkwaterwet>", "title": "...", "url": "https://..." } ]
  }
}

Rules:
- verdict "yes" means free almost everywhere for almost everyone, "no" means it almost always costs money,
  "usually" means free in most common situations, "depends" means it truly depends on context.
- scale.type describes WHY it is free in the most common situation in that region:
  free_good = not scarce, nobody pays even indirectly (air); collective = free at the point of use, paid by taxes or
  insurance premiums (public schools); third_party = free for the user, paid by a seller, advertiser or employer
  (wifi in a cafe); partial = free only for some groups, times or places, or as a basic version; exception = only free
  through promotions, trials or rare exceptions; paid = always paid.
- Markdown only: paragraphs, bullet lists, bold, links. No headings, no HTML, no tables.
- Region codes must be one of: ${REGIONS.join(', ')}. Only add a region when something specific is true there
  (a law, a national scheme, a common local practice). At most 6 regions. Never repeat a region.
- Prefer stating rules and mechanisms over exact prices, which change. If you give a price, say it is indicative.
- facts: at most 4, only figures you are certain about (dates of laws, physical quantities, well-known statistics).
  trivia: at most 3, each one true and checkable. Leave both empty rather than guess.
- When you are not sure about a regional fact, leave it out or say plainly that it varies.
- Sources: only URLs you are certain exist and are stable, such as official government sites or Wikipedia articles.
  An empty list is better than a guessed URL.
- Citations: put [^id] directly after a sentence that a source supports, e.g. "Restaurants must serve free tap water.[^ley-7-2022]".
  Only cite a source for claims it actually supports. Leave other sentences uncited: the site marks them as
  "citation needed" so people can check them. Never cite an id that is not in sources.
- Never mention specific shops or brands as recommendations.`;
  const user = `Subject slug: "${slug}"\nQuestion: ${QUESTION[lang](subject)}`;
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

/** Extracts the JSON object from a model answer, tolerating code fences around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new LlmError('No JSON object in model answer');
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new LlmError('Model answer is not valid JSON');
  }
}

export async function writeDraft(config: LlmConfig, lang: Language, slug: string): Promise<DraftResult> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(lang, slug),
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new LlmError(`LLM request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new LlmError(`LLM returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new LlmError('LLM answer has no content');

  const parsed = llmAnswerSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new LlmError(`LLM answer does not match the page schema: ${parsed.error.issues[0]?.message ?? ''}`);
  }
  if (!parsed.data.valid) return { ok: false, reason: parsed.data.reason };
  // A model never sets an image or a time price: images are generated separately and time
  // prices need figures with a source a person has checked.
  const { image: _image, timePrice: _timePrice, ...content } = parsed.data.content;
  return { ok: true, topicKey: parsed.data.topicKey, title: parsed.data.title, content: normalizeContent(content) };
}

const relatedSchema = z.object({ subjects: z.array(z.string().trim().min(1).max(60)).max(12) });

/**
 * Subjects related to a search query that people might ask "is it free?" about, written the way
 * page titles are: as they appear in the middle of a sentence.
 */
export async function suggestRelated(config: LlmConfig, lang: Language, query: string): Promise<string[]> {
  const system = `You suggest subjects for is.gratis, an encyclopedia that answers one question per subject: is it free?
Given a search query, list up to 8 concrete subjects closely related to it that people would ask that question about.
Write them in ${LANGUAGE_NAMES[lang]}, each as it would appear in the middle of a sentence: lowercase unless it is a name,
with an article only where the language needs one (e.g. "de huisarts", "openbaar vervoer", "museums").
Include the subject of the query itself first when it is a real subject.
Never suggest brands as recommendations, private persons, or anything hateful or sexual.
Answer with one JSON object and nothing else: {"subjects": ["...", "..."]}`;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Search query: "${query.replace(/"/g, "'")}"` },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 30_000)),
    });
  } catch (error) {
    throw new LlmError(`LLM request failed: ${(error as Error).message}`);
  }
  if (!response.ok) throw new LlmError(`LLM returned HTTP ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new LlmError('LLM answer has no content');
  const parsed = relatedSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new LlmError('LLM answer does not list subjects');
  return parsed.data.subjects.slice(0, 8);
}

const translationSchema = z.object({ title: titleSchema, content: pageContentSchema });

/**
 * Translates a page into another language. The answer must match the same schema as an edit,
 * with the same sources; it is stored as a draft for a person to check, like any LLM text.
 */
export async function translatePage(
  config: LlmConfig,
  from: Language,
  to: Language,
  page: { title: string; content: PageContent },
): Promise<{ title: string; content: PageContent }> {
  const { image, timePrice, ...content } = page.content;
  const system = `You translate pages of is.gratis, an encyclopedia that answers one question per subject: is it free?
Translate the page below from ${LANGUAGE_NAMES[from]} into ${LANGUAGE_NAMES[to]}. Answer with one JSON object
{"title": "...", "content": {...}} with exactly the same structure as the input, and nothing else.

Rules:
- title: the subject as written in the middle of a ${LANGUAGE_NAMES[to]} sentence (lowercase unless it is a name).
- Translate all text: summary, whenFree, whenNotFree, background, trivia, facts (label and value), region texts.
- Keep verdict, scale, plural (re-evaluate plural for the ${LANGUAGE_NAMES[to]} title), region codes, source ids and URLs unchanged.
  Translate source titles only when they are descriptions, not names of documents or websites.
- Keep every citation marker [^id] directly after the claim it supports. Never add or remove citations.
- [[links]]: translate the subject inside them into ${LANGUAGE_NAMES[to]}, e.g. [[de huisarts]] becomes [[the GP]] in English.
- Translate faithfully. Do not add facts, prices or sources. Where something is specific to one country, keep it so.
- Markdown only: paragraphs, bullet lists, bold, links. No headings, no HTML.`;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ title: page.title, content }) },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new LlmError(`LLM request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new LlmError(`LLM returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new LlmError('LLM answer has no content');
  const parsed = translationSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new LlmError(`Translation does not match the page schema: ${parsed.error.issues[0]?.message ?? ''}`);
  }
  // The image and the time price are not text: they carry over as they are.
  const translated = normalizeContent(parsed.data.content);
  return {
    title: parsed.data.title,
    content: { ...translated, ...(image ? { image } : {}), ...(timePrice ? { timePrice } : {}) },
  };
}
