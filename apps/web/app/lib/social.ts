/**
 * Open Graph and X/Twitter tags. Every page gets a 1200 × 630 card rendered by the API; the
 * revision number in the URL makes social networks fetch a new card after an edit.
 */
import type { Language } from '@isgratis/types';

const LOCALES: Record<Language, string> = { nl: 'nl_NL', en: 'en_GB', de: 'de_DE', es: 'es_ES' };

export function socialMeta(input: {
  origin: string;
  lang: Language;
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  type?: 'website' | 'article';
}) {
  const image = input.image.startsWith('http') ? input.image : `${input.origin}${input.image}`;
  return [
    { property: 'og:site_name', content: 'is.gratis' },
    { property: 'og:locale', content: LOCALES[input.lang] },
    { property: 'og:type', content: input.type ?? 'website' },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:url', content: input.url },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:alt', content: input.imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:image:alt', content: input.imageAlt },
  ];
}

export const siteCard = (lang: Language) => `/api/og/site/${lang}.png`;
export const pageCard = (lang: Language, slug: string, revision: number) => `/api/og/${lang}/${slug}.png?v=${revision}`;
