import { describe, expect, it } from 'vitest';
import { escapeXml, rssResponse } from './rss.server';

describe('rss', () => {
  it('escapes XML and writes a valid channel', async () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;');
    const response = rssResponse({
      title: 'is.gratis',
      link: 'https://is.gratis/nl',
      self: 'https://is.gratis/nl/feed.xml',
      description: 'Zon & maan',
      language: 'nl',
      cacheControl: 'public',
      items: [{ title: 'Is water gratis? Hangt ervan af.', link: 'https://is.gratis/nl/water', guid: 'g1', date: '2026-10-08T12:00:00Z', description: '<b>x</b>' }],
    });
    expect(response.headers.get('content-type')).toContain('application/rss+xml');
    const body = await response.text();
    expect(body).toContain('<description>Zon &amp; maan</description>');
    expect(body).toContain('<pubDate>Thu, 08 Oct 2026 12:00:00 GMT</pubDate>');
    expect(body).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
