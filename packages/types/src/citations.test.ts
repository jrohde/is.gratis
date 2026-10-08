import { describe, expect, it } from 'vitest';
import {
  citationStats,
  citeContent,
  claimBlocks,
  linkContent,
  normalizeContent,
  pageToLlmsText,
  pageToSource,
  parseSource,
  renderCitations,
  unknownCitations,
  withSourceIds,
} from './index.js';

const sources = [
  { id: 'wiki', title: 'Drinkwater (Wikipedia)', url: 'https://nl.wikipedia.org/wiki/Drinkwater' },
  { id: 'vn', title: 'VN-resolutie 64/292', url: 'https://example.org/vn' },
];

describe('citations', () => {
  it('gives every source a unique id', () => {
    expect(withSourceIds([{ title: 'Drinkwater' }, { title: 'Drinkwater' }, { id: 'Bad Id', title: 'Iets' }].map((s) => ({ url: 'https://x', ...s })))).toEqual([
      { id: 'drinkwater', title: 'Drinkwater', url: 'https://x' },
      { id: 'drinkwater-2', title: 'Drinkwater', url: 'https://x' },
      { id: 'iets', title: 'Iets', url: 'https://x' },
    ]);
  });

  it('turns [^id] into numbered footnotes', () => {
    expect(renderCitations('Kraanwater is goedkoop.[^wiki][^vn] En [^onbekend].', sources)).toBe(
      'Kraanwater is goedkoop.[1](#bron-1)[2](#bron-2) En [?](#bronnen).',
    );
    expect(renderCitations('Zie[^vn].', sources, 'plain')).toBe('Zie[2].');
  });

  it('splits text into the statements readers see', () => {
    expect(claimBlocks('Eerste alinea\nloopt door.\n\n- punt een\n- punt twee\n  vervolg\n\nLaatste.')).toEqual([
      'Eerste alinea loopt door.',
      '- punt een',
      '- punt twee   vervolg',
      'Laatste.',
    ]);
  });

  it('counts claims with and without a source', () => {
    const content = normalizeContent({
      verdict: 'depends',
      summary: 'Samenvatting zonder bron telt niet mee.',
      whenFree: '- Met bron.[^wiki]\n- Zonder bron.',
      background: 'Een alinea.[^vn]\n\nNog een zonder.',
      facts: [{ label: 'a', value: 'b', sourceUrl: 'https://x' }, { label: 'c', value: 'd' }],
      sources,
    });
    expect(citationStats(content)).toEqual({ claims: 6, cited: 3 });
  });

  it('finds citations to sources that do not exist', () => {
    expect(unknownCitations({ sources, whenFree: 'A[^wiki] B[^weg]', summary: 'C[^ook-weg]' })).toEqual(['ook-weg', 'weg']);
  });

  it('never puts an automatic link inside a citation', () => {
    const content = normalizeContent({ verdict: 'yes', summary: 'x', whenFree: 'Water is gratis.[^water]', sources: [{ id: 'water', title: 'W', url: 'https://x' }] });
    const linked = linkContent(content, 'nl', { missing: [], resolved: {}, auto: [{ term: 'water', slug: 'water' }] });
    expect(linked.whenFree).toBe('[Water](/nl/water) is gratis.[^water]');
    expect(citeContent(linked).whenFree).toBe('[Water](/nl/water) is gratis.[1](#bron-1)');
  });

  it('keeps ids in the Markdown source and rejects unknown citations there', () => {
    const content = normalizeContent({ verdict: 'yes', summary: 'Ja.', whenFree: 'Altijd.[^wiki]', sources });
    const source = pageToSource('lucht', content, 'nl');
    expect(source).toContain('- wiki: [Drinkwater (Wikipedia)](https://nl.wikipedia.org/wiki/Drinkwater)');
    expect(parseSource(source, 'nl')).toEqual({ ok: true, title: 'lucht', content });
    const broken = parseSource(source.replace('Altijd.[^wiki]', 'Altijd.[^nergens]'), 'nl');
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.errors[0]!.message).toContain('[^nergens]');
  });

  it('numbers sources and footnotes in llms.txt', () => {
    const content = normalizeContent({ verdict: 'yes', summary: 'Ja.', whenFree: 'Altijd.[^vn]\n\nOok zonder bron.', sources });
    const text = pageToLlmsText({
      lang: 'nl',
      title: 'lucht',
      content,
      status: 'published',
      url: 'https://is.gratis/nl/lucht',
      updatedAt: '2026-10-08T00:00:00Z',
      revision: 1,
      translations: [],
    });
    expect(text).toContain('Altijd.[2]');
    expect(text).toContain('1. [Drinkwater (Wikipedia)](https://nl.wikipedia.org/wiki/Drinkwater)');
    expect(text).toContain('- Beweringen met bron: 1 van 2');
  });
});
