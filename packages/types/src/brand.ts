/**
 * The is.gratis brand: a price tag without a price, filled with sky.
 *
 * The eyelet of the tag is a window on the real sky. In the daytime it holds the sun; at night it
 * holds the moon in today's actual phase, mirrored for the southern hemisphere. Every visitor
 * sees the sky above them at that moment, so the logo is never quite the same twice, and it
 * shows exactly what the site is about: the best things in life have no price.
 */
import type { Language } from './index.js';

export type Sky = 'day' | 'twilight' | 'night';

export interface SkyState {
  /** Moon phase: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number;
  sky: Sky;
  southern: boolean;
}

const SYNODIC_MONTH = 29.530588853;
// A well-documented new moon: 6 January 2000, 18:14 UTC.
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(date: Date): number {
  const days = (date.getTime() - NEW_MOON_EPOCH) / 86_400_000;
  const phase = (days / SYNODIC_MONTH) % 1;
  return phase < 0 ? phase + 1 : phase;
}

const SOUTHERN_ZONES = [
  'Australia/', 'Antarctica/', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Tongatapu',
  'America/Argentina/', 'America/Buenos_Aires', 'America/Santiago', 'America/Montevideo', 'America/Asuncion',
  'America/Sao_Paulo', 'America/La_Paz', 'America/Lima', 'Africa/Johannesburg', 'Africa/Maputo', 'Africa/Harare',
  'Africa/Windhoek', 'Africa/Gaborone', 'Africa/Lusaka', 'Indian/Mauritius', 'Indian/Reunion', 'Indian/Antananarivo',
];

export function isSouthern(timeZone: string | undefined): boolean {
  return Boolean(timeZone && SOUTHERN_ZONES.some((zone) => timeZone === zone || timeZone.startsWith(zone)));
}

export function skyForHour(hour: number): Sky {
  if (hour >= 8 && hour < 18) return 'day';
  if ((hour >= 6 && hour < 8) || (hour >= 18 && hour < 21)) return 'twilight';
  return 'night';
}

/** The sky above a visitor right now, from the clock and time zone of their device. */
export function skyAt(date: Date, timeZone?: string): SkyState {
  let hour = date.getUTCHours();
  try {
    hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date));
  } catch {
    // Unknown time zone: fall back to UTC.
  }
  return { phase: moonPhase(date), sky: skyForHour(hour), southern: isSouthern(timeZone) };
}

const SKIES: Record<Sky, [string, string]> = {
  day: ['#74c0fc', '#d0ebff'],
  twilight: ['#5f3dc4', '#ff922b'],
  night: ['#0b1d3a', '#3b2a7a'],
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The lit part of the moon as a path, for a disc of radius r at (cx, cy). */
export function moonLitPath(cx: number, cy: number, r: number, phase: number, southern = false): string {
  const waxing = phase < 0.5;
  const terminator = Math.abs(Math.cos(2 * Math.PI * phase)) * r;
  const crescent = phase < 0.25 || phase > 0.75;
  // Northern hemisphere: a waxing moon is lit on the right. The south sees it mirrored.
  const litRight = waxing !== southern;
  const top = `${r2(cx)} ${r2(cy - r)}`;
  const bottom = `${r2(cx)} ${r2(cy + r)}`;
  const limbSweep = litRight ? 1 : 0;
  // The terminator bulges toward the lit limb for a crescent and away from it for a gibbous moon.
  const terminatorSweep = crescent === litRight ? 0 : 1;
  return `M${top} A${r2(r)} ${r2(r)} 0 0 ${limbSweep} ${bottom} A${r2(terminator)} ${r2(r)} 0 0 ${terminatorSweep} ${top} Z`;
}

/** Rotates a point of the unrotated tag by 45° around the centre (32, 32). */
function rotate(x: number, y: number): [number, number] {
  const c = Math.SQRT1_2;
  const dx = x - 32;
  const dy = y - 32;
  return [32 + dx * c - dy * c, 32 + dx * c + dy * c];
}

/**
 * The logo mark as SVG. `idPrefix` keeps gradient and clip ids unique when several logos share
 * a page. Decorations are drawn upright and clipped to the tag, so stars and clouds stay level.
 */
export function logoSvg(state: SkyState, options: { size?: number; idPrefix?: string; title?: string } = {}): string {
  const size = options.size ?? 64;
  const id = options.idPrefix ?? 'isg';
  const [skyTop, skyBottom] = SKIES[state.sky];
  // The tag is drawn pointing left and turned 45°, so it hangs from its eyelet like a real price tag.
  const tag =
    'M7.6 30.3 L18.4 17.1 Q20.1 15 22.8 15 H52 Q58 15 58 21 V43 Q58 49 52 49 H22.8 Q20.1 49 18.4 46.9 L7.6 33.7 Q6.3 32 7.6 30.3 Z';
  const [hx, hy] = rotate(22.5, 32);
  const ring = 8.6;
  const disc = 6.9;
  const night = state.sky === 'night';
  const decorations =
    state.sky === 'day'
      ? [
          '<path d="M37 47 a3.2 3.2 0 0 1 5.6 -2 a4 4 0 0 1 7.4 1.6 a2.7 2.7 0 0 1 -0.4 5.4 h-12 a2.6 2.6 0 0 1 -0.6 -5z" fill="#fff" fill-opacity="0.95"/>',
          '<path d="M46 35.5 a2.4 2.4 0 0 1 4.2 -1.4 a3 3 0 0 1 5.5 1.2 a2 2 0 0 1 -0.3 4 h-8.9 a2 2 0 0 1 -0.5 -3.8z" fill="#fff" fill-opacity="0.8"/>',
        ].join('')
      : [
          [44, 30, 0.9], [53, 38, 1.2], [37, 44, 1], [47, 49, 0.8], [56, 52, 1.1], [41, 55, 0.7], [50, 29, 0.6], [33, 51, 0.6], [58, 45, 0.7],
        ]
          .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="${night ? 0.95 : 0.7}"/>`)
          .join('') + '<path d="M47 39 L48.1 41.9 L51 43 L48.1 44.1 L47 47 L45.9 44.1 L43 43 L45.9 41.9 Z" fill="#ffe066"/>';
  let celestial: string;
  if (night) {
    celestial =
      // The dark side glows faintly with earthshine, so even a new moon reads as a moon.
      `<circle cx="${r2(hx)}" cy="${r2(hy)}" r="${disc}" fill="#33406b"/>` +
      `<path d="${moonLitPath(hx, hy, disc, state.phase, state.southern)}" fill="#fff4cc"/>`;
  } else {
    const sun = state.sky === 'day' ? '#ffd43b' : '#ff922b';
    celestial =
      `<circle cx="${r2(hx)}" cy="${r2(hy)}" r="${disc}" fill="${state.sky === 'day' ? '#e7f5ff' : '#ffe8cc'}"/>` +
      `<circle cx="${r2(hx)}" cy="${r2(hy)}" r="${disc - 1.4}" fill="${sun}"/>`;
  }
  const thread = state.sky === 'day' ? '#1971c2' : '#ffd43b';
  const string = `<path d="M${r2(hx - ring * Math.SQRT1_2)} ${r2(hy - ring * Math.SQRT1_2)} C ${r2(hx - 12)} ${r2(hy - 9)}, 9 13, 4.2 5" fill="none" stroke="${thread}" stroke-width="1.7" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${options.title ?? 'is.gratis'}">
<defs>
<linearGradient id="${id}-sky" gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="64"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBottom}"/></linearGradient>
<clipPath id="${id}-clip"><path d="${tag}" transform="rotate(45 32 32)"/></clipPath>
</defs>
<path d="${tag}" transform="rotate(45 32 32)" fill="url(#${id}-sky)" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>
<g clip-path="url(#${id}-clip)">${decorations}</g>
${string}<path d="M3.5 0.6 L4.3 2.7 L6.4 3.5 L4.3 4.3 L3.5 6.4 L2.7 4.3 L0.6 3.5 L2.7 2.7 Z" fill="${thread}"/><circle cx="${r2(hx)}" cy="${r2(hy)}" r="${ring}" fill="#ffffff"/>${celestial}
</svg>`;
}

/** The mark for static places (favicon file, app icons, social cards): a young moon at night. */
export const LOGO_MARK_SVG = logoSvg({ phase: 0.2, sky: 'night', southern: false }, { idPrefix: 'isg-static' });

/** Wordmark colours: "is." in the text colour, "gratis" in green. */
export const BRAND_GREEN = '#2f9e44';

/** The slogan: free things come first, then the fact checking. */
export const SLOGAN: Record<Language, string> = {
  nl: 'Zon, maan en sterren zijn gratis. De rest zoeken wij uit.',
  en: 'The sun, the moon and the stars are free. We check the rest.',
  de: 'Sonne, Mond und Sterne sind gratis. Den Rest prüfen wir.',
  es: 'El sol, la luna y las estrellas son gratis. Lo demás lo comprobamos nosotros.',
};

/** The dot of "is.gratis": the same sun or moon as in the logo, small enough to sit in a word. */
export function skyDotSvg(state: SkyState, size = 10): string {
  if (state.sky !== 'night') {
    const sun = state.sky === 'day' ? '#fab005' : '#fd7e14';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${size}" height="${size}" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="${sun}"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${size}" height="${size}" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="#5c6a99" stroke="#ffd43b" stroke-opacity="0.55" stroke-width="0.8"/><path d="${moonLitPath(5, 5, 4, state.phase, state.southern)}" fill="#ffd43b"/></svg>`;
}

/** The sky the server renders before the browser knows the visitor's clock. */
export const STATIC_SKY: SkyState = { phase: 0.2, sky: 'night', southern: false };
