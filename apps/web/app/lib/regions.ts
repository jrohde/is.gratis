import type { Language, Region } from '@isgratis/types';

const WIDE_AREAS: Record<'EU' | 'WORLD', Record<Language, string>> = {
  EU: { nl: 'Europese Unie', en: 'European Union', de: 'Europäische Union', es: 'Unión Europea' },
  WORLD: { nl: 'Wereldwijd', en: 'Worldwide', de: 'Weltweit', es: 'Todo el mundo' },
};

/** Country names in the reader's language, from the runtime's own locale data. */
export function regionLabel(region: Region, lang: Language): string {
  if (region === 'EU' || region === 'WORLD') return WIDE_AREAS[region][lang];
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}

export function regionFlag(region: Region): string {
  if (region === 'WORLD') return '🌍';
  return String.fromCodePoint(...[...region].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/** The region a reader of this language most likely lives in. */
export const DEFAULT_REGION: Record<Language, Region> = { nl: 'NL', en: 'GB', de: 'DE', es: 'ES' };
