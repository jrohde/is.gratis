import { useParams, useSearchParams } from 'react-router';
import { isLanguage, type Language } from '@isgratis/types';
import { usePreferences } from '~/stores/preferences';

/** The interface language: from the URL, then ?lang=, then the stored preference, then Dutch. */
export function useUiLang(): Language {
  const params = useParams();
  const [search] = useSearchParams();
  const stored = usePreferences((state) => state.lang);
  if (params.lang && isLanguage(params.lang)) return params.lang;
  const fromQuery = search.get('lang');
  if (fromQuery && isLanguage(fromQuery)) return fromQuery;
  return stored ?? 'nl';
}
