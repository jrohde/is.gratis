import { env } from '~/lib/env.server';

export function loader() {
  const body = [
    'User-agent: *',
    'Disallow: /account/',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${env.publicOrigin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' },
  });
}
