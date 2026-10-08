/**
 * Citations, the way Wikipedia handles verifiability.
 *
 * Every source has a short id. A claim cites it with [^id] right after the sentence, as often as
 * needed; readers see a numbered footnote. A paragraph or list item without any citation is a
 * claim without a source and is shown as such ("citation needed").
 *
 * Nothing at module level may use values from index.ts: the modules import each other.
 */
import { toSlug, type PageContent, type Source } from './index.js';

/** [^drinkwater] */
export const CITATION = /\[\^([a-z0-9][a-z0-9-]{0,39})\]/g;
export const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type SourceInput = Omit<Source, 'id'> & { id?: string };

/** Gives every source an id: its own, or one derived from its title, unique within the page. */
export function withSourceIds(sources: SourceInput[]): Source[] {
  const taken = new Set<string>();
  return sources.map((source) => {
    let base = source.id && SOURCE_ID.test(source.id) ? source.id : toSlug(source.title).slice(0, 36).replace(/-+$/, '') || 'bron';
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return { id, title: source.title, url: source.url };
  });
}

export function citedIds(text: string): string[] {
  return [...text.matchAll(CITATION)].map((match) => match[1]!);
}

/** The texts in which claims are made. The summary is left out: it sums up the claims below it. */
export function claimTexts(content: PageContent): string[] {
  return [content.whenFree, content.whenNotFree, content.background, ...content.trivia, ...content.regions.map((r) => r.text)];
}

/** Ids cited anywhere on the page that do not belong to one of its sources. */
export function unknownCitations(content: Pick<PageContent, 'sources'> & Partial<PageContent>): string[] {
  const ids = new Set(content.sources.map((source) => source.id));
  const texts = [
    content.summary ?? '',
    content.whenFree ?? '',
    content.whenNotFree ?? '',
    content.background ?? '',
    ...(content.trivia ?? []),
    ...(content.regions ?? []).map((r) => r.text),
  ];
  return [...new Set(texts.flatMap(citedIds))].filter((id) => !ids.has(id));
}

/**
 * Splits Markdown into the blocks readers see as separate statements: paragraphs and list items.
 * This mirrors how the page marks claims, so the counts match what is on screen.
 */
export function claimBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join(' ').trim();
    if (text) blocks.push(text);
    current = [];
  };
  for (const line of markdown.split('\n')) {
    if (!line.trim()) flush();
    else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      current.push(line);
    } else current.push(line);
  }
  flush();
  return blocks;
}

export interface CitationStats {
  claims: number;
  cited: number;
}

export function citationStats(content: PageContent): CitationStats {
  let claims = 0;
  let cited = 0;
  for (const text of claimTexts(content)) {
    for (const block of claimBlocks(text)) {
      claims++;
      if (citedIds(block).length) cited++;
    }
  }
  for (const fact of content.facts) {
    claims++;
    if (fact.sourceUrl) cited++;
  }
  return { claims, cited };
}

/** Footnote number of each source: its position in the list, starting at 1. */
export function sourceNumbers(sources: Source[]): Map<string, number> {
  return new Map(sources.map((source, i) => [source.id, i + 1]));
}

/**
 * [^id] -> a link to the footnote: [1](#bron-1) in the page, or a plain [1] in llms.txt.
 * An unknown id (only possible in old revisions) becomes [?].
 */
export function renderCitations(markdown: string, sources: Source[], mode: 'anchor' | 'plain' = 'anchor'): string {
  const numbers = sourceNumbers(sources);
  return markdown.replace(CITATION, (_whole, id: string) => {
    const n = numbers.get(id);
    if (mode === 'plain') return n ? `[${n}]` : '[?]';
    return n ? `[${n}](#bron-${n})` : '[?](#bronnen)';
  });
}

/** Applies renderCitations to every text on the page. */
export function citeContent(content: PageContent): PageContent {
  const cite = (text: string) => renderCitations(text, content.sources);
  return {
    ...content,
    summary: cite(content.summary),
    whenFree: cite(content.whenFree),
    whenNotFree: cite(content.whenNotFree),
    background: cite(content.background),
    trivia: content.trivia.map(cite),
    regions: content.regions.map((block) => ({ ...block, text: cite(block.text) })),
  };
}
