/**
 * Labels that are part of the content format itself: section headings of the Markdown source
 * and llms.txt, and the names of the scale levels. Interface texts live in the web app.
 */
import type { FreeType, Language } from './index.js';

export const SECTION_KEYS = [
  'whenFree',
  'whenNotFree',
  'background',
  'facts',
  'trivia',
  'regions',
  'sources',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<Language, Record<SectionKey, string>> = {
  nl: {
    whenFree: 'Wanneer wel gratis',
    whenNotFree: 'Wanneer niet gratis',
    background: 'Achtergrond en wetenschap',
    facts: 'Kerncijfers',
    trivia: 'Wist je dat?',
    regions: 'Per land en regio',
    sources: 'Bronnen',
  },
  en: {
    whenFree: 'When it is free',
    whenNotFree: 'When it is not free',
    background: 'Background and science',
    facts: 'Key figures',
    trivia: 'Did you know?',
    regions: 'By country and region',
    sources: 'Sources',
  },
  de: {
    whenFree: 'Wann es kostenlos ist',
    whenNotFree: 'Wann es etwas kostet',
    background: 'Hintergrund und Wissenschaft',
    facts: 'Kennzahlen',
    trivia: 'Wusstest du?',
    regions: 'Nach Land und Region',
    sources: 'Quellen',
  },
  es: {
    whenFree: 'Cuándo es gratis',
    whenNotFree: 'Cuándo no es gratis',
    background: 'Contexto y ciencia',
    facts: 'Cifras clave',
    trivia: '¿Sabías que…?',
    regions: 'Por país y región',
    sources: 'Fuentes',
  },
};

export const FREE_TYPE_LABELS: Record<Language, Record<FreeType, string>> = {
  nl: {
    free_good: 'Vrij goed',
    collective: 'Collectief betaald',
    third_party: 'Betaald door een ander',
    partial: 'Deels gratis',
    exception: 'Alleen bij uitzondering',
    paid: 'Altijd betaald',
  },
  en: {
    free_good: 'Free good',
    collective: 'Paid collectively',
    third_party: 'Paid by someone else',
    partial: 'Partly free',
    exception: 'Only by exception',
    paid: 'Always paid',
  },
  de: {
    free_good: 'Freies Gut',
    collective: 'Gemeinschaftlich bezahlt',
    third_party: 'Von anderen bezahlt',
    partial: 'Teilweise kostenlos',
    exception: 'Nur ausnahmsweise',
    paid: 'Immer bezahlt',
  },
  es: {
    free_good: 'Bien libre',
    collective: 'Pagado colectivamente',
    third_party: 'Lo paga otro',
    partial: 'Gratis en parte',
    exception: 'Solo como excepción',
    paid: 'Siempre de pago',
  },
};

/** One line per type: what it means, in the reader's language. */
export const FREE_TYPE_DESCRIPTIONS: Record<Language, Record<FreeType, string>> = {
  nl: {
    free_good: 'Niet schaars: niemand betaalt, ook niet indirect.',
    collective: 'Gratis bij gebruik, betaald via belasting of premie.',
    third_party: 'Gratis voor jou, betaald door een verkoper, adverteerder of werkgever.',
    partial: 'Gratis voor bepaalde groepen, tijden of plaatsen, of als basisversie.',
    exception: 'Alleen gratis via acties, proefperiodes of uitzonderingen.',
    paid: 'Je betaalt er altijd voor.',
  },
  en: {
    free_good: 'Not scarce: nobody pays, not even indirectly.',
    collective: 'Free at the point of use, paid through taxes or premiums.',
    third_party: 'Free for you, paid by a seller, advertiser or employer.',
    partial: 'Free for certain groups, times or places, or as a basic version.',
    exception: 'Only free through promotions, trials or exceptions.',
    paid: 'You always pay for it.',
  },
  de: {
    free_good: 'Nicht knapp: niemand zahlt, auch nicht indirekt.',
    collective: 'Kostenlos bei Nutzung, bezahlt über Steuern oder Beiträge.',
    third_party: 'Für dich kostenlos, bezahlt von Händlern, Werbekunden oder Arbeitgebern.',
    partial: 'Kostenlos für bestimmte Gruppen, Zeiten oder Orte oder als Basisversion.',
    exception: 'Nur über Aktionen, Probezeiten oder Ausnahmen kostenlos.',
    paid: 'Du zahlst immer dafür.',
  },
  es: {
    free_good: 'No es escaso: nadie paga, ni siquiera de forma indirecta.',
    collective: 'Gratis al usarlo, pagado con impuestos o cuotas.',
    third_party: 'Gratis para ti, lo paga un vendedor, anunciante o empleador.',
    partial: 'Gratis para ciertos grupos, horarios o lugares, o en versión básica.',
    exception: 'Solo gratis con promociones, pruebas o excepciones.',
    paid: 'Siempre pagas por ello.',
  },
};

export const SCALE_NAME: Record<Language, string> = {
  nl: 'Gratis-schaal',
  en: 'Free scale',
  de: 'Gratis-Skala',
  es: 'Escala de gratuidad',
};
