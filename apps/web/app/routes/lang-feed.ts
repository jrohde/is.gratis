import { questionFor, VERDICT_LABELS, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/lang-feed';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';
import { rssResponse } from '~/lib/rss.server';

/** New and updated published pages in one language. */
export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const { pages } = await apiGet<{ pages: PageListItem[] }>(`/pages?lang=${lang}&status=published&limit=50`);
  const origin = env.publicOrigin;
  return rssResponse({
    title: messages(lang).recentFeedTitle,
    link: `${origin}/${lang}`,
    self: `${origin}/${lang}/feed.xml`,
    description: messages(lang).tagline,
    language: lang,
    cacheControl: 'public, max-age=0, s-maxage=600',
    items: pages.map((page) => ({
      title: `${questionFor(lang, page.title)} ${VERDICT_LABELS[lang][page.verdict]}.`,
      link: `${origin}/${lang}/${page.slug}`,
      guid: `${origin}/${lang}/${page.slug}#${page.updatedAt}`,
      date: page.updatedAt,
      description: plainText(page.summary, 400),
    })),
  });
}
