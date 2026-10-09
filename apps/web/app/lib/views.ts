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
