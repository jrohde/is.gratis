import { questionFor, type Page, type RevisionSummary } from '@isgratis/types';
import type { Route } from './+types/page-feed';
import { apiGet, apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { textResponse } from '~/lib/llms.server';
import { parseLang, parseSlug } from '~/lib/params';
import { rssResponse } from '~/lib/rss.server';

/** Every change to one page, like a Wikipedia history feed. */
export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const slug = parseSlug(params.slug);
  const page = await apiGetOptional<Page>(`/pages/${lang}/${slug}`);
  if (!page) return textResponse('Not found\n', CACHE.short, 404);
  const { revisions } = await apiGet<{ revisions: RevisionSummary[] }>(`/pages/${lang}/${slug}/revisions`);
  const t = messages(lang);
  const origin = env.publicOrigin;
  const url = `${origin}/${lang}/${slug}`;
  const author = (revision: RevisionSummary) =>
    revision.source === 'llm' ? t.llmAuthor : revision.source === 'seed' ? t.seedAuthor : (revision.authorName ?? t.anonymous);
  return rssResponse({
    title: t.feedTitle(questionFor(lang, page.title)),
    link: url,
    self: `${url}/feed.xml`,
    description: page.content.summary,
    language: lang,
    cacheControl: CACHE.page,
    items: revisions.slice(0, 50).map((revision) => ({
      title: `${revision.number}. ${revision.editSummary || t.history}`,
      link: `${url}/history?from=${revision.number - 1}&to=${revision.number}`,
      guid: `${url}#revision-${revision.number}`,
      date: revision.createdAt,
      description: `${author(revision)}: ${revision.editSummary || '–'}`,
      author: author(revision),
    })),
  });
}
