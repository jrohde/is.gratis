/**
 * The is.gratis brand: an asterisk.
 *
 * Everywhere else an asterisk after "free" means there is a catch in the small print. Here it
 * points to the honest answer. The name is "is.gratis*", the slogan is the footnote "*Is het?",
 * and every page states its subject as a claim, "Water is gratis*", with the answer as the
 * footnote: "*deels". The footnote is the free scale, the researched six-step scale from the
 * methodology page.
 */
import { FREE_TYPE_LEVEL } from './index.js';
import type { FreeType, Language, PageContent, Verdict } from './index.js';

/** The green of the asterisk. */
export const BRAND_GREEN = '#2f9e44';
/** Text colour on light backgrounds. */
export const BRAND_INK = '#1b1f24';
export const BRAND_INK_DARK = '#f1f3f5';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The asterisk in a 64 × 64 box: six rounded arms, one pointing straight up like a typeset
 * asterisk. Five arms would read as a star (a rating), so it is always six.
 */
export const ASTERISK_PATH = Array.from({ length: 6 }, (_, i) => {
  const angle = ((-90 + i * 60) * Math.PI) / 180;
  return `M32 32 L${r2(32 + Math.cos(angle) * 23)} ${r2(32 + Math.sin(angle) * 23)}`;
}).join(' ');
export const ASTERISK_STROKE = 12;

export interface AsteriskOptions {
  color?: string;
  size?: number;
  /** Accessible name; an empty string hides it from assistive technology. */
  title?: string;
}

export function asteriskSvg(options: AsteriskOptions = {}): string {
  const dims = options.size ? ` width="${options.size}" height="${options.size}"` : '';
  const label = options.title ? ` role="img" aria-label="${options.title}"` : ' aria-hidden="true"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${dims}${label}>` +
    `<path d="${ASTERISK_PATH}" fill="none" stroke="${options.color ?? BRAND_GREEN}" stroke-width="${ASTERISK_STROKE}" stroke-linecap="round"/></svg>`
  );
}

/**
 * The app icon and favicon: a white asterisk on a green tile. Clear down to 16 pixels. Home screen
 * icons are square: the system rounds the corners itself.
 */
export function iconSvg(size?: number, rounded = true): string {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${dims} role="img" aria-label="is.gratis">` +
    `<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${BRAND_GREEN}"/>` +
    `<g transform="translate(32 32) scale(0.62) translate(-32 -32)"><path d="${ASTERISK_PATH}" fill="none" stroke="#ffffff" stroke-width="${ASTERISK_STROKE}" stroke-linecap="round"/></g></svg>`
  );
}

/** The slogan: the footnote that turns the name back into the question. */
export const SLOGAN: Record<Language, string> = {
  nl: 'Is het?',
  en: 'Is it?',
  de: 'Ist es?',
  es: '¿Lo es?',
};

const COPULA: Record<Language, [string, string]> = {
  nl: ['is', 'zijn'],
  en: ['is', 'are'],
  de: ['ist', 'sind'],
  es: ['es', 'son'],
};
const FREE_WORD: Record<Language, string> = { nl: 'gratis', en: 'free', de: 'gratis', es: 'gratis' };

/** "Water is gratis", "Musea zijn gratis", "Air is free": the subject stated as a claim. */
export function claimFor(lang: Language, subject: string, plural = false): string {
  const start = subject.charAt(0).toLocaleUpperCase(lang) + subject.slice(1);
  return `${start} ${COPULA[lang][plural ? 1 : 0]} ${FREE_WORD[lang]}`;
}

/** The answer to the claim, by step of the free scale: short enough to be a footnote. */
export const SCALE_FOOTNOTES: Record<Language, Record<FreeType, string>> = {
  nl: {
    free_good: 'echt',
    collective: 'via belasting',
    third_party: 'door iemand anders',
    partial: 'deels',
    exception: 'bij uitzondering',
    paid: 'echt niet',
  },
  en: {
    free_good: 'really',
    collective: 'through taxes',
    third_party: 'by someone else',
    partial: 'partly',
    exception: 'by exception',
    paid: 'really not',
  },
  de: {
    free_good: 'wirklich',
    collective: 'über Steuern',
    third_party: 'durch andere',
    partial: 'teilweise',
    exception: 'ausnahmsweise',
    paid: 'wirklich nicht',
  },
  es: {
    free_good: 'de verdad',
    collective: 'con impuestos',
    third_party: 'lo paga otro',
    partial: 'en parte',
    exception: 'por excepción',
    paid: 'para nada',
  },
};

/** For pages without a free scale yet: the verdict as a footnote. */
export const VERDICT_FOOTNOTES: Record<Language, Record<Verdict, string>> = {
  nl: { yes: 'ja', usually: 'meestal', depends: 'hangt ervan af', no: 'nee' },
  en: { yes: 'yes', usually: 'usually', depends: 'it depends', no: 'no' },
  de: { yes: 'ja', usually: 'meistens', depends: 'kommt darauf an', no: 'nein' },
  es: { yes: 'sí', usually: 'casi siempre', depends: 'depende', no: 'no' },
};

/**
 * Text colours for the six steps of the scale, from "really not" (0, red) to "really" (5, the
 * brand green). Dark enough to read on white.
 */
export const SCALE_TEXT_COLORS = ['#e03131', '#e8590c', '#e67700', '#5c940d', '#099268', BRAND_GREEN] as const;
const VERDICT_LEVEL: Record<Verdict, number> = { yes: 5, usually: 4, depends: 2, no: 0 };

export interface Footnote {
  text: string;
  /** Step on the free scale, or the nearest step for a verdict. */
  level: number;
  color: string;
  /** The free scale applies to one region; null when the footnote comes from the verdict. */
  region: string | null;
}

/** The footnote under a page's claim: its step on the free scale, or else its verdict. */
// FREE_TYPE_LEVEL is only read inside the function: index.js imports this module too.
export function footnoteFor(lang: Language, content: Pick<PageContent, 'scale' | 'verdict'>): Footnote {
  if (content.scale) {
    const level = FREE_TYPE_LEVEL[content.scale.type];
    return { text: SCALE_FOOTNOTES[lang][content.scale.type], level, color: SCALE_TEXT_COLORS[level]!, region: content.scale.region };
  }
  const level = VERDICT_LEVEL[content.verdict];
  return { text: VERDICT_FOOTNOTES[lang][content.verdict], level, color: SCALE_TEXT_COLORS[level]!, region: null };
}

/** The word on the stamp of approval, in each language. */
export const STAMP_WORD: Record<Language, string> = {
  nl: 'nagekeken',
  en: 'checked',
  de: 'geprüft',
  es: 'verificado',
};

/**
 * The stamp of approval for sponsored offers that passed review: a round stamp, slightly askew,
 * with "IS.GRATIS* · NAGEKEKEN" around the asterisk. The text uses the page's font.
 */
export function stampSvg(lang: Language, options: { size?: number; idPrefix?: string } = {}): string {
  const id = options.idPrefix ?? 'isg-stamp';
  const dims = options.size ? ` width="${options.size}" height="${options.size}"` : '';
  const text = `IS.GRATIS* · ${STAMP_WORD[lang].toUpperCase()} · `;
  // The ring text runs along a circle that starts at the left, clockwise.
  // Baseline radius 68: the capitals reach to about 86, inside the outer ring at 95.
  const ring = 'M 32 100 A 68 68 0 1 1 168 100 A 68 68 0 1 1 32 100';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"${dims} role="img" aria-label="is.gratis* ${STAMP_WORD[lang]}">` +
    `<defs><path id="${id}-ring" d="${ring}"/></defs>` +
    `<g transform="rotate(-10 100 100)" fill="${BRAND_GREEN}" stroke="${BRAND_GREEN}">` +
    `<circle cx="100" cy="100" r="95" fill="none" stroke-width="6"/>` +
    `<circle cx="100" cy="100" r="58" fill="none" stroke-width="4"/>` +
    `<text font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="25" stroke="none">` +
    `<textPath href="#${id}-ring" textLength="424" lengthAdjust="spacing">${text}</textPath></text>` +
    `<g transform="translate(100 100) scale(1.15) translate(-32 -32)"><path d="${ASTERISK_PATH}" fill="none" stroke-width="${ASTERISK_STROKE}" stroke-linecap="round"/></g>` +
    `</g></svg>`
  );
}
