import { describe, expect, it } from 'vitest';
import { normalizeContent, type Revision } from '@isgratis/types';
import { diffRevisions } from './revision-diff';

const revision = (number: number, patch: Partial<Revision['content']>): Revision => ({
  id: String(number),
  number,
  title: 'water',
  editSummary: '',
  source: 'human',
  authorName: null,
  createdAt: '2026-10-08T00:00:00.000Z',
  content: normalizeContent({ verdict: 'depends', summary: 'Hangt ervan af.', ...patch }),
});

describe('diffRevisions', () => {
  it('reports only the sections that changed', () => {
    const diff = diffRevisions(
      revision(1, { trivia: ['Oud weetje.'] }),
      revision(2, { trivia: ['Nieuw weetje.'], scale: { type: 'collective', region: 'NL' } }),
      'nl',
    );
    expect(diff.map((field) => field.label)).toEqual(['Infoblok', 'Wist je dat?']);
    const trivia = diff[1]!.changes;
    expect(trivia.find((c) => c.removed)?.value).toContain('Oud');
    expect(trivia.find((c) => c.added)?.value).toContain('Nieuw');
  });

  it('shows everything as added for a first revision compared with nothing', () => {
    const empty = revision(0, { summary: '' });
    const diff = diffRevisions(empty, revision(1, { background: 'Uitleg.' }), 'nl');
    expect(diff.map((field) => field.label)).toEqual(['Kort antwoord', 'Achtergrond en wetenschap']);
  });
});
