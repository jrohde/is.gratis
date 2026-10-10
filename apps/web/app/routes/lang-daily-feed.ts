import { claimFor, footnoteFor, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/lang-daily-feed';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';
import { rssResponse } from '~/lib/rss.server';

/** The free thing of the day as a feed: one item per day, ready for a bot to post. */
export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const { days } = await apiGet<{ days: Array<{ day: string; page: PageListItem }> }>(`/week?lang=${lang}&days=14`);
  const origin = env.publicOrigin;
  const t = messages(lang);
  return rssResponse({
    title: `${t.dailyTitle} · is.gratis*`,
    link: `${origin}/week/${lang}`,
    self: `${origin}/${lang}/daily.xml`,
    description: t.weekIntro,
    language: lang,
    cacheControl: 'public, max-age=0, s-maxage=1800',
    items: days.map(({ day, page }) => ({
      title: `${claimFor(lang, page.title, page.plural)}* *${footnoteFor(lang, page).text}`,
      link: `${origin}/${lang}/${page.slug}`,
      guid: `${origin}/${lang}/daily/${day}`,
      date: `${day}T06:00:00Z`,
      description: plainText(page.summary, 400),
    })),
  });
}
