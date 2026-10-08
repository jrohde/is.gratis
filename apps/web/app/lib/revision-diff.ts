import { diffWords, type Change } from 'diff';
import { VERDICT_LABELS, type Language, type Revision } from '@isgratis/types';
import { messages } from './i18n';
import { regionLabel } from './regions';

export interface FieldDiff {
  label: string;
  changes: Change[];
}

function sections(revision: Revision, lang: Language): Array<[string, string]> {
  const t = messages(lang);
  const { content } = revision;
  return [
    [t.subject, revision.title],
    [t.verdict, VERDICT_LABELS[lang][content.verdict]],
    [t.summary, content.summary],
    [t.whenFree, content.whenFree],
    [t.whenNotFree, content.whenNotFree],
    [
      t.regions,
      content.regions
        .map((block) => `${regionLabel(block.region, lang)} (${VERDICT_LABELS[lang][block.verdict]}): ${block.text}`)
        .join('\n\n'),
    ],
    [t.sources, content.sources.map((source) => `${source.title} ${source.url}`).join('\n')],
  ];
}

/** Word-level differences per field; unchanged fields are left out. */
export function diffRevisions(from: Revision, to: Revision, lang: Language): FieldDiff[] {
  const before = sections(from, lang);
  const after = sections(to, lang);
  return after
    .map(([label, text], i) => ({ label, changes: diffWords(before[i]?.[1] ?? '', text) }))
    .filter((field) => field.changes.some((change) => change.added || change.removed));
}
