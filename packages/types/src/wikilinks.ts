/**
 * Links between pages, the way Wikipedia does it.
 *
 * - Editors write [[water]] or [[openbaar vervoer|de bus]]. A link to a page that does not exist
 *   yet is a "red link": it leads to the page where a first version can be written.
 * - The first mention of another existing subject is linked automatically, so readers can click
 *   through even where nobody added a link by hand.
 *
 * Nothing at module level may use values from index.ts: the modules import each other.
 */
import { toSlug, type Language, type PageContent } from './index.js';

export interface AutoLink {
  /** The words as they appear in running text, e.g. "huisarts" for the page "de huisarts". */
  term: string;
  slug: string;
}

export interface PageLinks {
  /** Slugs of [[links]] whose page does not exist yet. */
  missing: string[];
  /** [[Links]] that reach an existing page under another slug, e.g. de-huisarts -> huisarts. */
  resolved: Record<string, string>;
  /** Existing pages mentioned in the text, for automatic links. */
  auto: AutoLink[];
}

const WIKILINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
// Text that must never get a link inside it: existing links, wikilinks, code and bare URLs.
const PROTECTED = /(\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`|https?:\/\/\S+)/g;

const ARTICLES: Record<Language, string[]> = {
  nl: ['de', 'het', 'een', "'t"],
  en: ['the', 'a', 'an'],
  de: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'],
};

/** "de huisarts" -> "huisarts", "een openbaar toilet" -> "openbaar toilet". */
export function linkTerm(title: string, lang: Language): string {
  const words = title.trim().split(/\s+/);
  if (words.length > 1 && ARTICLES[lang].includes(words[0]!.toLowerCase())) words.shift();
  return words.join(' ');
}

/** "de-huisarts" -> "huisarts": the slug of a title without its leading article, if it had one. */
export function slugWithoutArticle(slug: string, lang: Language): string | null {
  const [first, ...rest] = slug.split('-');
  return rest.length && ARTICLES[lang].includes(first!) ? rest.join('-') : null;
}

/** Every piece of running text on a page, in reading order. */
export function contentTexts(content: PageContent): string[] {
  return [
    content.summary,
    content.whenFree,
    content.whenNotFree,
    content.background,
    ...content.trivia,
    ...content.regions.map((block) => block.text),
  ];
}

/** Slugs of all [[links]] on a page. */
export function wikiLinkSlugs(content: PageContent): string[] {
  const slugs = new Set<string>();
  for (const text of contentTexts(content)) {
    for (const match of text.matchAll(WIKILINK)) {
      const slug = toSlug(match[1]!);
      if (slug) slugs.add(slug);
    }
  }
  return [...slugs];
}

const escapeLabel = (label: string) => label.replace(/([[\]\\])/g, '\\$1');
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** [[target|label]] -> [label](origin/lang/slug). `resolved` maps a slug to the page it points to. */
export function renderWikiLinks(
  markdown: string,
  lang: Language,
  origin = '',
  resolved: Record<string, string> = {},
): string {
  return markdown.replace(WIKILINK, (whole, target: string, label?: string) => {
    const raw = toSlug(target);
    if (!raw) return whole;
    const slug = resolved[raw] ?? raw;
    return `[${escapeLabel((label ?? target).trim())}](${origin}/${lang}/${slug})`;
  });
}

/** Whole-word, case-insensitive match that respects letters with accents. */
export function termPattern(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escapeRegExp(term).replace(/\s+/g, '\\s+')})(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Links the first mention of each term that is not linked yet. `used` carries over between
 * texts, so a subject is only linked once per page, like on Wikipedia.
 */
export function autoLink(markdown: string, terms: AutoLink[], used: Set<string>, lang: Language, origin = ''): string {
  let text = markdown;
  for (const { term, slug } of terms) {
    if (used.has(slug)) continue;
    const pattern = termPattern(term);
    const parts = text.split(PROTECTED);
    let done = false;
    for (let i = 0; i < parts.length && !done; i += 2) {
      // Even indexes are free text, odd indexes the protected pieces captured by split().
      const part = parts[i]!;
      if (pattern.test(part)) {
        parts[i] = part.replace(pattern, (word) => `[${escapeLabel(word)}](${origin}/${lang}/${slug})`);
        done = true;
      }
    }
    if (done) {
      used.add(slug);
      text = parts.join('');
    }
  }
  return text;
}

/**
 * Returns the content with [[links]] turned into Markdown links and the first mention of every
 * known subject linked. The stored content is never changed; this only affects how it is shown.
 */
export function linkContent(content: PageContent, lang: Language, links: PageLinks, origin = ''): PageContent {
  const used = new Set<string>();
  // Explicit links count as the first mention of their subject.
  for (const slug of wikiLinkSlugs(content)) used.add(links.resolved[slug] ?? slug);
  const terms = [...links.auto].sort((a, b) => b.term.length - a.term.length);
  const apply = (text: string) =>
    autoLink(renderWikiLinks(text, lang, origin, links.resolved), terms, used, lang, origin);
  return {
    ...content,
    summary: apply(content.summary),
    whenFree: apply(content.whenFree),
    whenNotFree: apply(content.whenNotFree),
    background: apply(content.background),
    trivia: content.trivia.map(apply),
    regions: content.regions.map((block) => ({ ...block, text: apply(block.text) })),
  };
}
