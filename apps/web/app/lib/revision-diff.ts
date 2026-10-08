/**
 * Differences between two revisions, computed on the Markdown source per section. This is how
 * Wikipedia shows changes too: a diff of the wikitext, so every field is covered automatically.
 */
import { diffWords, type Change } from 'diff';
import { pageToSource, type Language, type Revision } from '@isgratis/types';
import { messages } from './i18n';

export interface FieldDiff {
  label: string;
  changes: Change[];
}

function chunks(revision: Revision, lang: Language): Map<string, string> {
  const t = messages(lang);
  const source = pageToSource(revision.title, revision.content, lang);
  const result = new Map<string, string>();
  const [, front = '', rest = ''] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source) ?? [];
  const image = revision.content.image;
  result.set(t.infobox, image ? `${front}\nimage: ${image.alt} (${image.assetId}${image.ai ? ', AI' : ''})` : front);
  const [summary = '', ...sections] = rest.split(/^## /m);
  result.set(t.summary, summary.replace(/^>\s?/gm, '').trim());
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = newline === -1 ? section.trim() : section.slice(0, newline).trim();
    result.set(heading, newline === -1 ? '' : section.slice(newline + 1).trim());
  }
  return result;
}

/** Word-level differences per section; unchanged sections are left out. */
export function diffRevisions(from: Revision, to: Revision, lang: Language): FieldDiff[] {
  const before = chunks(from, lang);
  const after = chunks(to, lang);
  const labels = [...new Set([...after.keys(), ...before.keys()])];
  return labels
    .map((label) => ({ label, changes: diffWords(before.get(label) ?? '', after.get(label) ?? '') }))
    .filter((field) => field.changes.some((change) => change.added || change.removed));
}
