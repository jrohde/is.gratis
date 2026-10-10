/**
 * Where the bot posts. Each channel is one account in one language; a channel is its own bot
 * run, so a failure on one never makes another post twice.
 */
import type { Language } from '@isgratis/types';

export interface Post {
  /** The whole text, link included. */
  text: string;
  link: string;
  lang: Language;
  /** Unique per post: Mastodon uses it to refuse a duplicate. */
  idempotencyKey: string;
}

export interface Channel {
  /** "mastodon:nl", "bluesky:en", "log:nl". */
  id: string;
  lang: Language;
  /** Most characters a post may have. */
  maxLength: number;
  publish: (post: Post) => Promise<string>;
}

export interface MastodonAccount {
  lang: Language;
  /** The instance, e.g. https://mastodon.example; your own instance works the same. */
  url: string;
  token: string;
}

export interface BlueskyAccount {
  lang: Language;
  /** The PDS, https://bsky.social unless you host your own. */
  service?: string;
  identifier: string;
  /** An app password, not the account password. */
  password: string;
}

const TIMEOUT = 20_000;

export function mastodonChannel(account: MastodonAccount, fetcher: typeof fetch = fetch): Channel {
  const base = account.url.replace(/\/+$/, '');
  return {
    id: `mastodon:${account.lang}`,
    lang: account.lang,
    maxLength: 500,
    publish: async (post) => {
      const response = await fetcher(`${base}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.token}`,
          'content-type': 'application/json',
          'idempotency-key': post.idempotencyKey,
        },
        body: JSON.stringify({ status: post.text, language: post.lang, visibility: 'public' }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!response.ok) throw new Error(`Mastodon answered HTTP ${response.status}`);
      const body = (await response.json()) as { url?: string };
      return body.url ?? 'posted';
    },
  };
}

/** Byte offsets in UTF-8, which is how Bluesky marks the link inside the text. */
function byteRange(text: string, part: string): { byteStart: number; byteEnd: number } | null {
  const index = text.indexOf(part);
  if (index < 0) return null;
  const encoder = new TextEncoder();
  const byteStart = encoder.encode(text.slice(0, index)).length;
  return { byteStart, byteEnd: byteStart + encoder.encode(part).length };
}

export function blueskyChannel(account: BlueskyAccount, fetcher: typeof fetch = fetch): Channel {
  const service = (account.service ?? 'https://bsky.social').replace(/\/+$/, '');
  return {
    id: `bluesky:${account.lang}`,
    lang: account.lang,
    maxLength: 300,
    publish: async (post) => {
      const session = await fetcher(`${service}/xrpc/com.atproto.server.createSession`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: account.identifier, password: account.password }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!session.ok) throw new Error(`Bluesky login answered HTTP ${session.status}`);
      const { accessJwt, did } = (await session.json()) as { accessJwt: string; did: string };
      const range = byteRange(post.text, post.link);
      const record = {
        $type: 'app.bsky.feed.post',
        text: post.text,
        createdAt: new Date().toISOString(),
        langs: [post.lang],
        ...(range ? { facets: [{ index: range, features: [{ $type: 'app.bsky.richtext.facet#link', uri: post.link }] }] } : {}),
      };
      const created = await fetcher(`${service}/xrpc/com.atproto.repo.createRecord`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessJwt}` },
        body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!created.ok) throw new Error(`Bluesky answered HTTP ${created.status}`);
      const body = (await created.json()) as { uri?: string };
      return body.uri ?? 'posted';
    },
  };
}

/** Writes the post to the log instead: for trying the bot out before connecting accounts. */
export function logChannel(lang: Language, logger: { info: (obj: object, msg: string) => void }): Channel {
  return {
    id: `log:${lang}`,
    lang,
    maxLength: 500,
    publish: async (post) => {
      logger.info({ lang, text: post.text }, 'bot post (dry run)');
      return 'logged';
    },
  };
}
