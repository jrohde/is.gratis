import { data } from 'react-router';
import { isLanguage, isValidSlug, type Language } from '@isgratis/types';

/** Validates the :lang route parameter; anything else is a 404. */
export function parseLang(value: string | undefined): Language {
  if (!value || !isLanguage(value)) throw data(null, { status: 404 });
  return value;
}

export function parseSlug(value: string | undefined): string {
  if (!value || !isValidSlug(value)) throw data(null, { status: 404 });
  return value;
}
