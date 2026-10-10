/**
 * Checks whether a source URL still works.
 *
 * Source URLs are typed by editors, so the worker must never be tricked into calling internal
 * services (the API, the database, cloud metadata). Every connection is made through a DNS lookup
 * that refuses private, loopback and link-local addresses, at connect time, so a DNS answer that
 * changes between check and connect cannot slip through. Redirects are followed by hand, each hop
 * checked the same way.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

export interface LinkCheckResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

const PRIVATE_V4: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15
  [0xe0000000, 3], // multicast and reserved
];

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const n = address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
    return PRIVATE_V4.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
  }
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A DNS lookup for http(s).request that refuses private addresses. */
function guardedLookup(hostname: string, options: object, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as LookupAddress[];
    const blocked = list.find((entry) => isPrivateAddress(entry.address));
    if (blocked || list.length === 0) {
      const refusal = new Error(`Refusing to connect to a private address (${hostname})`) as NodeJS.ErrnoException;
      refusal.code = 'EPRIVATE';
      return callback(refusal, []);
    }
    if ((options as { all?: boolean }).all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

function request(url: URL, method: 'HEAD' | 'GET', timeoutMs: number): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method,
        lookup: guardedLookup as never,
        timeout: timeoutMs,
        headers: { 'user-agent': 'is.gratis source checker (+https://is.gratis/developers)', accept: '*/*' },
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
        res.destroy();
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end();
  });
}

export async function checkLink(raw: string, timeoutMs = 10_000, maxRedirects = 3): Promise<LinkCheckResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: null, error: 'Invalid URL' };
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, status: null, error: 'Not http(s)' };
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
      return { ok: false, status: null, error: 'Private address' };
    }
    try {
      let response = await request(url, 'HEAD', timeoutMs);
      // Some servers do not support HEAD: ask again with GET (the body is not read).
      if ([403, 405, 501].includes(response.status)) response = await request(url, 'GET', timeoutMs);
      if (response.status >= 300 && response.status < 400 && response.location) {
        url = new URL(response.location, url);
        continue;
      }
      // Sites that turn away bots (401, 403, 429) still exist: only real failures count as broken.
      const reachable = (response.status >= 200 && response.status < 400) || [401, 403, 429].includes(response.status);
      return { ok: reachable, status: response.status, error: null };
    } catch (error) {
      return { ok: false, status: null, error: (error as Error).message.slice(0, 200) };
    }
  }
  return { ok: false, status: null, error: 'Too many redirects' };
}

export interface PageTextResult {
  ok: boolean;
  status: number | null;
  /** Readable text of an HTML or plain text page, without scripts, styles and tags. */
  text: string | null;
  error: string | null;
}

function getBody(url: URL, timeoutMs: number, maxBytes: number): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup as never,
        timeout: timeoutMs,
        headers: {
          'user-agent': 'is.gratis offer checker (+https://is.gratis/developers)',
          accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 || !/text\/(html|plain)|application\/xhtml/.test(type)) {
          res.resume();
          resolve({ status, location: res.headers.location, type, body: '' });
          res.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size <= maxBytes) chunks.push(chunk);
          else res.destroy();
        });
        const done = () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') });
        res.on('end', done);
        res.on('close', done);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** Turns HTML into the text a visitor reads, roughly: enough for a language model to judge. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&euro;/g, '€')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Reads the text of a page, with the same protection against internal addresses as checkLink.
 * Used to show the editorial language model what an advertiser's landing page really says.
 */
export async function fetchPageText(raw: string, timeoutMs = 10_000, maxBytes = 1_000_000, maxRedirects = 3): Promise<PageTextResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: null, text: null, error: 'Invalid URL' };
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, status: null, text: null, error: 'Not http(s)' };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && isPrivateAddress(host)) return { ok: false, status: null, text: null, error: 'Private address' };
    try {
      const response = await getBody(url, timeoutMs, maxBytes);
      if (response.status >= 300 && response.status < 400 && response.location) {
        url = new URL(response.location, url);
        continue;
      }
      if (response.status < 200 || response.status >= 300) return { ok: false, status: response.status, text: null, error: null };
      const text = response.type.includes('html') ? htmlToText(response.body) : response.body.trim();
      return { ok: true, status: response.status, text, error: null };
    } catch (error) {
      return { ok: false, status: null, text: null, error: (error as Error).message.slice(0, 200) };
    }
  }
  return { ok: false, status: null, text: null, error: 'Too many redirects' };
}
