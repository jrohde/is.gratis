import { domainToUnicode } from 'node:url';
import { classifyHost, type HostKind } from './host';

/** classifyHost with punycode support (xn--caf-dma.is.gratis is café.is.gratis). */
export function classifyRequestHost(host: string, baseDomain: string): HostKind {
  return classifyHost(host, baseDomain, domainToUnicode);
}
