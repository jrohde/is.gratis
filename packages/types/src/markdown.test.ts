import { describe, expect, it } from 'vitest';
import {
  FREE_TYPE_LEVEL,
  formatDuration,
  normalizeContent,
  pageToLlmsText,
  pageToSource,
  parseSource,
  timePriceSeconds,
  type PageContent,
} from './index.js';

const content: PageContent = {
  verdict: 'depends',
  emoji: '💧',
  summary: 'Hangt ervan af. Kraanwater kost geld,\nmaar weinig.',
  whenFree: '- **Openbare watertappunten**\n- Regenwater',
  whenNotFree: 'Thuis betaal je per kubieke meter.\n\nFlessenwater is duurder.',
  background: 'Drinkwater is een nutsvoorziening.[^drinkwater]',
  scale: { type: 'partial', region: 'NL' },
  timePrice: {
    unit: '1 liter kraanwater',
    price: 0.0015,
    hourlyWage: 20,
    currency: 'EUR',
    region: 'NL',
    source: { title: 'Rekenvoorbeeld', url: 'https://example.com/loon' },
  },
  facts: [
    { label: 'Prijs per liter', value: 'minder dan een cent', sourceUrl: 'https://example.com/prijs' },
    { label: 'Mensenrecht sinds', value: '2010' },
  ],
  trivia: ['Een liter kraanwater kost minder dan een cent.', 'Regen is gratis.'],
  regions: [
    { region: 'NL', verdict: 'depends', text: 'Horeca mag geld vragen.' },
    { region: 'FR', verdict: 'yes', text: 'Een karaf is gratis.\n\nBij een maaltijd.' },
  ],
  sources: [{ id: 'drinkwater', title: 'Drinkwater (Wikipedia)', url: 'https://nl.wikipedia.org/wiki/Drinkwater' }],
};

describe('Markdown source', () => {
  it('round-trips every field', () => {
    for (const lang of ['nl', 'en', 'de', 'es'] as const) {
      const source = pageToSource('water', content, lang);
      const parsed = parseSource(source, lang);
      expect(parsed).toEqual({ ok: true, title: 'water', content });
    }
  });

  it('round-trips a minimal page and keeps empty sections out of the content', () => {
    const minimal = normalizeContent({ verdict: 'yes', summary: 'Ja.' });
    const parsed = parseSource(pageToSource('lucht', minimal, 'nl'), 'nl');
    expect(parsed).toEqual({ ok: true, title: 'lucht', content: minimal });
  });

  it('writes readable source with localised headings', () => {
    const source = pageToSource('water', content, 'nl');
    expect(source).toContain('## Wanneer wel gratis');
    expect(source).toContain('### Frankrijk [FR]: Ja');
    expect(source).toContain('- **Prijs per liter**: minder dan een cent ([bron](https://example.com/prijs))');
    expect(source.startsWith('---\ntitle: water\nverdict: depends\n')).toBe(true);
  });

  it('accepts English headings and verdict codes in any language', () => {
    const source = [
      '---',
      'title: wifi',
      'verdict: usually',
      '---',
      'Meestal.',
      '## When it is free',
      'In de bibliotheek.',
      '## By country and region',
      '### [NL]: usually',
      'Vaak gratis.',
    ].join('\n');
    const parsed = parseSource(source, 'nl');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.content.whenFree).toBe('In de bibliotheek.');
      expect(parsed.content.regions).toEqual([{ region: 'NL', verdict: 'usually', text: 'Vaak gratis.' }]);
    }
  });

  it('reports every problem with its line number', () => {
    const source = [
      '---', // 1
      'title: x', // 2
      'verdict: misschien', // 3
      'kleur: blauw', // 4
      '---', // 5
      '', // 6
      '## Onzin', // 7
      '## Bronnen', // 8
      '- geen link', // 9
      '## Per land en regio', // 10
      '### Atlantis [AT2]: Ja', // 11
    ].join('\n');
    const parsed = parseSource(source, 'nl');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const lines = parsed.errors.map((e) => e.line).sort((a, b) => a - b);
      expect(lines).toEqual([3, 4, 7, 7, 9, 11]);
    }
  });
});

describe('llms.txt', () => {
  it('describes the page with metadata and leaves out empty sections', () => {
    const text = pageToLlmsText({
      lang: 'nl',
      title: 'water',
      content: { ...content, background: '' },
      status: 'draft',
      url: 'https://is.gratis/nl/water',
      updatedAt: '2026-10-08T12:00:00.000Z',
      revision: 3,
      translations: [{ lang: 'en', url: 'https://is.gratis/en/water' }],
    });
    expect(text.startsWith('# 💧 Is water gratis?\n\n> Hangt ervan af.')).toBe(true);
    expect(text).toContain('- Gratis-schaal: 2 van 5, deels gratis (Nederland)');
    expect(text).toContain('- Tijdprijs: 0,27 seconden werk voor 1 liter kraanwater');
    expect(text).toContain('Status: concept');
    expect(text).toContain('- Bijgewerkt: 2026-10-08 (versie 3)');
    expect(text).toContain('[en](https://is.gratis/en/water)');
    expect(text).not.toContain('## Achtergrond');
  });
});

describe('scale and time price', () => {
  it('maps each type to one level', () => {
    expect(Object.values(FREE_TYPE_LEVEL).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('computes seconds of work and formats them', () => {
    expect(timePriceSeconds({ price: 10, hourlyWage: 20 })).toBe(1800);
    expect(formatDuration(0.27, 'nl')).toBe('0,27 seconden');
    expect(formatDuration(90, 'en')).toBe('1.5 minutes');
    expect(formatDuration(7200, 'de')).toBe('2 Stunden');
  });
});
