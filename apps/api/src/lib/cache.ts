/**
 * Invalidates the HTTP cache (Varnish) after content changes.
 *
 * Varnish replicas each hold their own cache, so the target hostname is resolved to all its
 * addresses (a Kubernetes headless Service returns one per pod) and every replica gets the BAN.
 * Failures are logged and swallowed: a missed ban only means the page stays stale until its TTL.
 */
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import type { FastifyBaseLogger } from 'fastify';

export interface CacheInvalidator {
  purgePage(lang: string, slug: string): Promise<void>;
}

export function createCacheInvalidator(
  target: string | undefined,
  logger: Pick<FastifyBaseLogger, 'warn' | 'debug'>,
): CacheInvalidator {
  if (!target) {
    return { purgePage: async () => {} };
  }
  const [host, portRaw] = target.split(':');
  const port = Number(portRaw ?? 80);

  async function addresses(): Promise<string[]> {
    if (!host) return [];
    if (isIP(host)) return [host];
    try {
      return await dns.resolve4(host);
    } catch {
      return [host];
    }
  }

  async function ban(pattern: string): Promise<void> {
    const targets = await addresses();
    const results = await Promise.allSettled(
      targets.map((address) =>
        fetch(`http://${address}:${port}/`, {
          method: 'BAN',
          headers: { 'X-Ban-Url': pattern },
          signal: AbortSignal.timeout(2000),
        }),
      ),
    );
    results.forEach((result, i) => {
      if (result.status === 'rejected' || !result.value.ok) {
        logger.warn({ target: targets[i], pattern }, 'cache ban failed');
      }
    });
    logger.debug({ pattern, replicas: targets.length }, 'cache ban sent');
  }

  return {
    // Slugs only contain [a-z0-9-], so they are safe inside a regular expression.
    // Matches the page, its sub pages (/edit, /history) and React Router data requests (.data).
    purgePage: (lang, slug) => ban(`^/${lang}/${slug}([/?.]|$)`),
  };
}
