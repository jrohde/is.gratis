import { pageToLlmsText, type Page } from '@isgratis/types';
import type { Route } from './+types/page-llms';
import { apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { env } from '~/lib/env.server';
import { textResponse } from '~/lib/llms.server';
import { parseLang, parseSlug } from '~/lib/params';

/** One page as Markdown, generated from the same content as the HTML page. */
export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const slug = parseSlug(params.slug);
  const page = await apiGetOptional<Page>(`/pages/${lang}/${slug}`);
  if (!page) return textResponse('Not found\n', CACHE.short, 404);
  const origin = env.publicOrigin;
  const body = pageToLlmsText({
    lang,
    title: page.title,
    content: page.content,
    status: page.status,
    url: `${origin}/${lang}/${slug}`,
    updatedAt: page.updatedAt,
    revision: page.currentRevision.number,
    translations: page.translations.map((tr) => ({ lang: tr.lang, url: `${origin}/${tr.lang}/${tr.slug}/llms.txt` })),
  });
  return textResponse(body, page.status === 'published' ? CACHE.page : CACHE.short);
}
