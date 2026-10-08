/**
 * The is.gratis brand: a planet with a golden orbit, a star and a moon. The best things in life
 * are free, starting with the earth, the sun, the moon and the stars.
 */
import type { Language } from './index.js';

/** The mark on its own, for favicons, app icons and social cards. Works on light and dark. */
export const LOGO_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="isg-planet" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
      <stop offset="0" stop-color="#69db7c"/>
      <stop offset="0.55" stop-color="#20c997"/>
      <stop offset="1" stop-color="#1098ad"/>
    </linearGradient>
  </defs>
  <path d="M6.3 38.3 A27 9 -18 0 1 57.7 21.7" fill="none" stroke="#fcc419" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="17" fill="url(#isg-planet)"/>
  <path d="M24 22.5 c4 -1.5 8 0.5 9 3.5 c-3.5 0.5 -5 3 -9.5 2.5 c-1.8 -2 -1.5 -4.5 0.5 -6z M37 33 c3 -1 6 1 6.5 4 c-2.5 1.5 -5.5 1.5 -7.5 -0.5 c-0.5 -1.3 0 -2.7 1 -3.5z" fill="#ffffff" fill-opacity="0.28"/>
  <path d="M57.7 21.7 A27 9 -18 0 1 6.3 38.3" fill="none" stroke="#fcc419" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M53.6 41.2 A5.6 5.6 0 1 0 59.6 49.6 A4.4 4.4 0 1 1 53.6 41.2 Z" fill="#dee2e6"/>
  <path d="M12 4.5 L13.9 9.6 L19 11.5 L13.9 13.4 L12 18.5 L10.1 13.4 L5 11.5 L10.1 9.6 Z" fill="#fcc419"/>
</svg>`;

/** Wordmark colours: "is." in the text colour, "gratis" in green. */
export const BRAND_GREEN = '#2f9e44';

/** The slogan: free things come first, then the fact checking. */
export const SLOGAN: Record<Language, string> = {
  nl: 'Zon, maan en sterren zijn gratis. De rest zoeken wij uit.',
  en: 'The sun, the moon and the stars are free. We check the rest.',
  de: 'Sonne, Mond und Sterne sind gratis. Den Rest prüfen wir.',
  es: 'El sol, la luna y las estrellas son gratis. Lo demás lo comprobamos nosotros.',
};
