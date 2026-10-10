/**
 * Which VAT goes on an invoice. Sold from the Netherlands to businesses:
 * - in the Netherlands, or without a VAT number: Dutch VAT;
 * - elsewhere in the EU with a VAT number: reverse charge, 0% with a note;
 * - outside the EU: no Dutch VAT, 0% with a note.
 * Have an accountant confirm this fits your situation; the rates are settings, not law.
 */
import type { Language } from '@isgratis/types';

export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

const NOTES: Record<Language, { reverse: string; outside: string }> = {
  nl: { reverse: 'Btw verlegd naar de afnemer (art. 196 Btw-richtlijn).', outside: 'Dienst buiten de EU: geen Nederlandse btw.' },
  en: { reverse: 'VAT reverse charged to the customer (art. 196 VAT Directive).', outside: 'Service outside the EU: no Dutch VAT.' },
  de: {
    reverse: 'Steuerschuldnerschaft des Leistungsempfängers (Art. 196 MwSt-Richtlinie).',
    outside: 'Leistung außerhalb der EU: keine niederländische MwSt.',
  },
  es: { reverse: 'Inversión del sujeto pasivo (art. 196 Directiva del IVA).', outside: 'Servicio fuera de la UE: sin IVA neerlandés.' },
};

export function vatFor(
  input: { country: string | null; vatNumber: string | null; lang: Language },
  dutchRateBps: number,
): { rateBps: number; note: string | null } {
  const country = (input.country ?? 'NL').toUpperCase();
  if (country === 'NL') return { rateBps: dutchRateBps, note: null };
  if (EU_COUNTRIES.has(country)) {
    return input.vatNumber ? { rateBps: 0, note: NOTES[input.lang].reverse } : { rateBps: dutchRateBps, note: null };
  }
  return { rateBps: 0, note: NOTES[input.lang].outside };
}

/** VAT on an amount, rounded to whole cents. */
export const vatOn = (cents: number, rateBps: number) => Math.round((cents * rateBps) / 10_000);
