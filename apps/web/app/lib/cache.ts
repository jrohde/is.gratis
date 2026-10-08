/**
 * Cache-Control values.
 *
 * Browsers always revalidate (max-age=0), so editors see their change immediately. Varnish
 * honours s-maxage and keeps pages long, because the API bans a page from the cache the moment
 * it changes. Serving stale content while revalidating is configured in Varnish (grace), not
 * here: stale-while-revalidate would also make browsers show outdated pages.
 */
export const CACHE = {
  /** Published pages: purged on every edit. */
  page: 'public, max-age=0, s-maxage=86400',
  /** Drafts, missing pages and lists change often or without a purge. */
  short: 'public, max-age=0, s-maxage=60',
  /** Account, editor and admin pages. */
  none: 'private, no-store',
} as const;
