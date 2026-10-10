/**
 * The editorial language model: reads an LLM draft the way an editor would, and decides to
 * publish it, publish a corrected version, or leave it for a person.
 *
 * It may only make a page smaller or more accurate: it can fix, rephrase and remove, but never
 * add a source. Every revised page passes the same schema as a human edit.
 */
import { z } from 'zod';
import { normalizeContent, type Language, type PageContent } from '@isgratis/types';
import { pageContentSchema, titleSchema } from './content.js';
import { LlmError, PAGE_RULES, chatJson, type LlmConfig } from './llm.js';

export type EditorVerdict =
  | { decision: 'publish'; notes: string }
  | { decision: 'revise'; notes: string; title: string; content: PageContent }
  | { decision: 'reject'; notes: string };

export interface DraftForReview {
  lang: Language;
  title: string;
  content: PageContent;
  /** Source URLs that did not answer or answered with an error just now. */
  deadSources: string[];
}

const LANGUAGE_NAMES: Record<Language, string> = {
  nl: 'Dutch',
  en: 'English',
  de: 'German',
  es: 'Spanish',
};

const answerSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('publish'), notes: z.string().trim().min(1).max(500) }),
  z.object({ decision: z.literal('reject'), notes: z.string().trim().min(1).max(500) }),
  z.object({
    decision: z.literal('revise'),
    notes: z.string().trim().min(1).max(500),
    title: titleSchema,
    content: pageContentSchema,
  }),
]);

export function buildEditorMessages(draft: DraftForReview) {
  const language = LANGUAGE_NAMES[draft.lang];
  const system = `You are the editor of is.gratis, an encyclopedia that answers exactly one question per page: is it free?
A language model wrote the draft below. Nobody else will check it before readers see it, so you are the last line
between a mistake and thousands of readers. Be strict about facts and relaxed about style.

Check the draft against these rules, which the writer was given too:
${PAGE_RULES}

Also check:
- Is every statement true? Is the verdict right, and does it agree with summary, whenFree and whenNotFree?
- Is scale.type the right step of the scale for the most common situation in scale.region?
- Is every regional text really specific to that region, and true there?
- Does each [^id] citation sit after a claim that source plausibly supports?
- Is the page neutral, never promotional, and free of anything hateful, sexual or about a private person?
- Sources listed under "deadSources" no longer work: remove them and their citations.

Then answer with one JSON object and nothing else, in one of three forms:
- {"decision": "publish", "notes": "..."} when the draft is accurate and follows the rules. Small style issues are no reason
  to hold it back.
- {"decision": "revise", "notes": "...", "title": "...", "content": {...}} when you can fix every problem yourself. Give the
  complete corrected page in exactly the input structure. Remove what is doubtful rather than guessing; never add a source,
  URL, figure or fact you are not certain about. Never add a source that is not in the draft.
- {"decision": "reject", "notes": "..."} when the subject is not real, the draft is mostly wrong, or getting it right needs
  facts you do not know. A person will look at it.
"notes": one or two sentences in ${language} for the other editors: what you checked, changed or found wrong.`;
  const { image: _image, timePrice: _timePrice, ...content } = draft.content;
  const user = JSON.stringify({ title: draft.title, content, deadSources: draft.deadSources });
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

export async function reviewDraft(
  config: LlmConfig,
  draft: DraftForReview,
): Promise<EditorVerdict> {
  const parsed = answerSchema.safeParse(await chatJson(config, buildEditorMessages(draft), 0));
  if (!parsed.success) {
    throw new LlmError(
      `Editor answer does not match the schema: ${parsed.error.issues[0]?.message ?? ''}`,
    );
  }
  const answer = parsed.data;
  if (answer.decision !== 'revise') return answer;

  const known = new Set(draft.content.sources.map((source) => source.url));
  const added = answer.content.sources.find((source) => !known.has(source.url));
  if (added) throw new LlmError(`Editor added a source, which it may not do: ${added.url}`);
  // The image and the time price are not the editor's business: they carry over as they are.
  const { image, timePrice } = draft.content;
  const { image: _image, timePrice: _timePrice, ...revised } = answer.content;
  return {
    decision: 'revise',
    notes: answer.notes,
    title: answer.title,
    content: {
      ...normalizeContent(revised),
      ...(image ? { image } : {}),
      ...(timePrice ? { timePrice } : {}),
    },
  };
}
