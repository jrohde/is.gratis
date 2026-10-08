import { env } from '~/lib/env.server';

export function loader() {
  const body = [
    'User-agent: *',
    'Disallow: /account/',
    'Disallow: /admin',
    'Disallow: /api/',
    'Allow: /api/media/',
    '',
    `Sitemap: ${env.publicOrigin}/sitemap.xml`,
    '# Markdown versions of every page for language models: /llms.txt',
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' },
  });
}
