/**
 * Counts a page view with one anonymous request: no cookies, no identifiers. Crawlers that do
 * not run JavaScript are not counted, which is what sponsors pay for.
 */
const counted = new Set<string>();

export function countView(lang: string, slug: string) {
  const key = `${lang}/${slug}`;
  // Once per page per browser tab: revalidations and re-renders do not count again.
  if (counted.has(key) || (typeof navigator !== 'undefined' && navigator.webdriver)) return;
  counted.add(key);
  void fetch('/api/views', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lang, slug }),
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {});
}

const shownOffers = new Set<string>();

/** Counts that sponsored offers were shown, once per offer per tab. Nothing about the visitor. */
export function countOfferImpressions(ids: string[]) {
  const fresh = ids.filter((id) => !shownOffers.has(id));
  if (fresh.length === 0 || (typeof navigator !== 'undefined' && navigator.webdriver)) return;
  fresh.forEach((id) => shownOffers.add(id));
  void fetch('/api/offers/impressions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: fresh.slice(0, 6) }),
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {});
}
