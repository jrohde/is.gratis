import { describe, expect, it } from 'vitest';
import { asteriskSvg, claimFor, footnoteFor, iconSvg, SCALE_FOOTNOTES, SLOGAN } from './index.js';

describe('brand', () => {
  it('draws an asterisk with six arms', () => {
    expect(asteriskSvg().match(/M32 32/g)).toHaveLength(6);
    expect(asteriskSvg({ title: 'is.gratis*' })).toContain('aria-label="is.gratis*"');
    expect(asteriskSvg()).toContain('aria-hidden="true"');
    expect(iconSvg(32)).toContain('width="32"');
  });

  it('states the subject as a claim, singular or plural', () => {
    expect(claimFor('nl', 'water')).toBe('Water is gratis');
    expect(claimFor('nl', 'musea', true)).toBe('Musea zijn gratis');
    expect(claimFor('nl', 'de huisarts')).toBe('De huisarts is gratis');
    expect(claimFor('en', 'air')).toBe('Air is free');
    expect(claimFor('de', 'Museen', true)).toBe('Museen sind gratis');
    expect(claimFor('es', 'el agua')).toBe('El agua es gratis');
  });

  it('answers with the free scale, or the verdict when there is no scale', () => {
    expect(footnoteFor('nl', { verdict: 'depends', scale: { type: 'partial', region: 'NL' } })).toMatchObject({
      text: 'deels',
      level: 2,
      region: 'NL',
    });
    expect(footnoteFor('nl', { verdict: 'yes', scale: { type: 'free_good', region: 'WORLD' } }).text).toBe('echt');
    expect(footnoteFor('nl', { verdict: 'no', scale: { type: 'paid', region: 'NL' } }).text).toBe('echt niet');
    expect(footnoteFor('en', { verdict: 'depends' })).toMatchObject({ text: 'it depends', region: null });
  });

  it('has every footnote and the slogan in every language', () => {
    for (const lang of ['nl', 'en', 'de', 'es'] as const) {
      expect(Object.values(SCALE_FOOTNOTES[lang]).every(Boolean)).toBe(true);
      expect(SLOGAN[lang]).toMatch(/\?$/);
    }
  });
});
