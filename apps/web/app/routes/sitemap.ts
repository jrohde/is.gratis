import type { Language } from '@isgratis/types';
import type { Route } from './+types/sitemap';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';

interface Entry {
  lang: Language;
  slug: string;
  updatedAt: string;
  topicKey: string;
}

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** XML sitemap with hreflang alternates between translations of the same topic. */
export async function loader(_: Route.LoaderArgs) {
  const { entries } = await apiGet<{ entries: Entry[] }>('/sitemap');
  const byTopic = new Map<string, Entry[]>();
  for (const entry of entries) byTopic.set(entry.topicKey, [...(byTopic.get(entry.topicKey) ?? []), entry]);

  const url = (entry: Entry) => `${env.publicOrigin}/${entry.lang}/${entry.slug}`;
  const body = entries
    .map((entry) => {
      const alternates = (byTopic.get(entry.topicKey) ?? [])
        .map((alt) => `<xhtml:link rel="alternate" hreflang="${alt.lang}" href="${escape(url(alt))}"/>`)
        .join('');
      return `<url><loc>${escape(url(entry))}</loc><lastmod>${entry.updatedAt}</lastmod>${alternates}</url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' },
  });
}
