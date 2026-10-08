/**
 * Which subjects a page mentions: red links for [[links]] to pages that do not exist yet, and
 * automatic links for existing subjects named in the text.
 */
import { and, eq, inArray } from 'drizzle-orm';
import {
  contentTexts,
  linkTerm,
  slugWithoutArticle,
  termPattern,
  wikiLinkSlugs,
  type AutoLink,
  type Language,
  type PageContent,
  type PageLinks,
} from '@isgratis/types';
import type { Database } from '../db/client.js';
import { pages } from '../db/schema.js';

const CACHE_MS = 60_000;
const MAX_AUTO_LINKS = 40;
const titleCache = new Map<Language, { at: number; terms: AutoLink[] }>();

/** Link terms of all published pages in a language, cached for a minute per process. */
async function termsFor(db: Database, lang: Language): Promise<AutoLink[]> {
  const cached = titleCache.get(lang);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.terms;
  const rows = await db
    .select({ slug: pages.slug, title: pages.title })
    .from(pages)
    .where(and(eq(pages.lang, lang), eq(pages.status, 'published')));
  const terms = rows
    .map((row) => ({ term: linkTerm(row.title, lang), slug: row.slug }))
    .filter((entry) => entry.term.length >= 3)
    .sort((a, b) => b.term.length - a.term.length);
  titleCache.set(lang, { at: Date.now(), terms });
  return terms;
}

export function clearLinkCache(): void {
  titleCache.clear();
}

export async function pageLinks(db: Database, lang: Language, slug: string, content: PageContent): Promise<PageLinks> {
  const explicit = wikiLinkSlugs(content);
  // Like Wikipedia, [[de huisarts]] finds the page "huisarts": try the slug without its article too.
  const candidates = new Set(explicit);
  for (const target of explicit) {
    const bare = slugWithoutArticle(target, lang);
    if (bare) candidates.add(bare);
  }
  const existing = candidates.size
    ? await db
        .select({ slug: pages.slug })
        .from(pages)
        .where(and(eq(pages.lang, lang), inArray(pages.slug, [...candidates])))
    : [];
  const existingSet = new Set(existing.map((row) => row.slug));
  const missing: string[] = [];
  const resolved: Record<string, string> = {};
  for (const target of explicit) {
    if (existingSet.has(target) || target === slug) continue;
    const bare = slugWithoutArticle(target, lang);
    if (bare && existingSet.has(bare)) resolved[target] = bare;
    else missing.push(target);
  }

  const text = contentTexts(content).join('\n');
  const auto: AutoLink[] = [];
  for (const entry of await termsFor(db, lang)) {
    if (entry.slug === slug) continue;
    if (termPattern(entry.term).test(text)) auto.push(entry);
    if (auto.length >= MAX_AUTO_LINKS) break;
  }
  return { missing, resolved, auto };
}
