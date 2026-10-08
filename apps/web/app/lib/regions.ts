import { regionName, type Language, type Region } from '@isgratis/types';

/** Country names in the reader's language. */
export function regionLabel(region: Region, lang: Language): string {
  return regionName(region, lang);
}

export function regionFlag(region: Region): string {
  if (region === 'WORLD') return '🌍';
  return String.fromCodePoint(...[...region].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/** The region a reader of this language most likely lives in. */
export const DEFAULT_REGION: Record<Language, Region> = { nl: 'NL', en: 'GB', de: 'DE', es: 'ES' };
