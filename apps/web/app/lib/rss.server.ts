/** RSS 2.0, the format every feed reader understands. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface FeedItem {
  title: string;
  link: string;
  guid: string;
  date: string;
  description: string;
  author?: string;
}

export function rssResponse(feed: {
  title: string;
  link: string;
  self: string;
  description: string;
  language: string;
  items: FeedItem[];
  cacheControl: string;
}): Response {
  const items = feed.items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>${item.author ? `\n      <dc:creator>${escapeXml(item.author)}</dc:creator>` : ''}
      <description>${escapeXml(item.description)}</description>
    </item>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <link>${escapeXml(feed.link)}</link>
    <atom:link href="${escapeXml(feed.self)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(feed.description)}</description>
    <language>${feed.language}</language>
    <image><url>${escapeXml(new URL('/icon-192.png', feed.link).toString())}</url><title>${escapeXml(feed.title)}</title><link>${escapeXml(feed.link)}</link></image>
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': feed.cacheControl },
  });
}
