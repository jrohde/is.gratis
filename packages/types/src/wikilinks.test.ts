import { describe, expect, it } from 'vitest';
import { autoLink, linkContent, linkTerm, normalizeContent, renderWikiLinks, slugWithoutArticle, wikiLinkSlugs } from './index.js';

describe('wikilinks', () => {
  it('turns [[links]] into Markdown links', () => {
    expect(renderWikiLinks('Zie [[Openbaar vervoer]] en [[water|kraanwater]].', 'nl')).toBe(
      'Zie [Openbaar vervoer](/nl/openbaar-vervoer) en [kraanwater](/nl/water).',
    );
    expect(renderWikiLinks('[[water]]', 'en', 'https://is.gratis')).toBe('[water](https://is.gratis/en/water)');
    expect(renderWikiLinks('[[???]] blijft staan', 'nl')).toBe('[[???]] blijft staan');
  });

  it('follows links to a page under its slug without article', () => {
    expect(slugWithoutArticle('de-huisarts', 'nl')).toBe('huisarts');
    expect(slugWithoutArticle('water', 'nl')).toBeNull();
    expect(renderWikiLinks('[[de huisarts]]', 'nl', '', { 'de-huisarts': 'huisarts' })).toBe('[de huisarts](/nl/huisarts)');
  });

  it('finds the slugs of all links on a page', () => {
    const content = normalizeContent({
      verdict: 'yes',
      summary: 'Zie [[Water]].',
      trivia: ['Net als [[lucht]] en [[water|kraanwater]].'],
    });
    expect(wikiLinkSlugs(content).sort()).toEqual(['lucht', 'water']);
  });

  it('strips leading articles from titles', () => {
    expect(linkTerm('de huisarts', 'nl')).toBe('huisarts');
    expect(linkTerm('een openbaar toilet', 'nl')).toBe('openbaar toilet');
    expect(linkTerm('the library', 'en')).toBe('library');
    expect(linkTerm('water', 'nl')).toBe('water');
  });

  it('links only whole words, only once and never inside existing links or code', () => {
    const used = new Set<string>();
    const terms = [{ term: 'water', slug: 'water' }];
    const text = 'Kraanwater is water. Meer water. Zie [water](https://x.nl) en `water`.';
    expect(autoLink(text, terms, used, 'nl')).toBe(
      'Kraanwater is [water](/nl/water). Meer water. Zie [water](https://x.nl) en `water`.',
    );
    expect(autoLink('Nog meer water.', terms, used, 'nl')).toBe('Nog meer water.');
  });

  it('matches accents and multi-word terms case-insensitively', () => {
    const used = new Set<string>();
    expect(autoLink('Het Openbaar  Vervoer en café.', [{ term: 'openbaar vervoer', slug: 'openbaar-vervoer' }, { term: 'café', slug: 'cafe' }], used, 'nl')).toBe(
      'Het [Openbaar  Vervoer](/nl/openbaar-vervoer) en [café](/nl/cafe).',
    );
  });

  it('links each subject once per page, after the explicit links', () => {
    const content = normalizeContent({
      verdict: 'depends',
      summary: 'Water en lucht.',
      whenFree: 'Lucht en [[water]] opnieuw.',
    });
    const linked = linkContent(content, 'nl', { missing: [], resolved: {}, auto: [{ term: 'water', slug: 'water' }, { term: 'lucht', slug: 'lucht' }] });
    expect(linked.summary).toBe('Water en [lucht](/nl/lucht).');
    expect(linked.whenFree).toBe('Lucht en [water](/nl/water) opnieuw.');
  });
});
