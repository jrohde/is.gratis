import { describe, expect, it } from 'vitest';
import { pickLanguage, toSlug } from '@isgratis/types';
import { classifyHost } from './host';

describe('classifyHost', () => {
  it('recognises the apex, www and other hosts', () => {
    expect(classifyHost('is.gratis', 'is.gratis')).toEqual({ kind: 'apex' });
    expect(classifyHost('is.gratis:443', 'is.gratis')).toEqual({ kind: 'apex' });
    expect(classifyHost('www.is.gratis', 'is.gratis')).toEqual({ kind: 'www' });
    expect(classifyHost('example.com', 'is.gratis')).toEqual({ kind: 'other' });
    expect(classifyHost('notis.gratis', 'is.gratis')).toEqual({ kind: 'other' });
  });

  it('turns a subdomain into a slug', () => {
    expect(classifyHost('Water.is.gratis', 'is.gratis')).toEqual({ kind: 'subdomain', slug: 'water' });
    expect(classifyHost('openbaar-vervoer.is.gratis', 'is.gratis')).toEqual({
      kind: 'subdomain',
      slug: 'openbaar-vervoer',
    });
    expect(classifyHost('xn--caf-dma.is.gratis', 'is.gratis', () => 'café')).toEqual({ kind: 'subdomain', slug: 'cafe' });
    expect(classifyHost('a.b.is.gratis', 'is.gratis')).toEqual({ kind: 'subdomain', slug: null });
    expect(classifyHost('water.localhost:5173', 'localhost')).toEqual({ kind: 'subdomain', slug: 'water' });
  });
});

describe('shared helpers', () => {
  it('makes slugs from free text', () => {
    expect(toSlug('Openbaar Vervoer')).toBe('openbaar-vervoer');
    expect(toSlug('  Café crème! ')).toBe('cafe-creme');
    expect(toSlug('???')).toBe('');
  });

  it('picks a language from Accept-Language', () => {
    expect(pickLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(pickLanguage('fr-FR,fr;q=0.9,en;q=0.5')).toBe('en');
    expect(pickLanguage('fr-FR')).toBe('nl');
    expect(pickLanguage(null)).toBe('nl');
    expect(pickLanguage('en;q=0.2,es;q=0.9')).toBe('es');
    expect(pickLanguage('es', ['nl', 'en'], 'nl')).toBe('nl');
  });
});
