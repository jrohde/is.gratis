/**
 * Subdomain handling: water.is.gratis is the shareable address of is.gratis/<lang>/water.
 * Pure functions so they can be tested without a server.
 */
import { toSlug } from '@isgratis/types';

export type HostKind =
  | { kind: 'apex' }
  | { kind: 'other' }
  | { kind: 'www' }
  | { kind: 'subdomain'; slug: string | null };

/**
 * @param host Host header, possibly with a port.
 * @param baseDomain The apex domain, e.g. "is.gratis".
 * @param decode Converts a punycode label (xn--caf-dma) to Unicode (café).
 */
export function classifyHost(host: string, baseDomain: string, decode: (label: string) => string = (l) => l): HostKind {
  const name = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (name === baseDomain) return { kind: 'apex' };
  if (!name.endsWith(`.${baseDomain}`)) return { kind: 'other' };
  const label = name.slice(0, -(baseDomain.length + 1));
  if (label === 'www') return { kind: 'www' };
  if (label.includes('.')) return { kind: 'subdomain', slug: null };
  const slug = toSlug(decode(label));
  return { kind: 'subdomain', slug: slug || null };
}
