import { questionFor, VERDICT_LABELS, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/lang-llms';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { textResponse } from '~/lib/llms.server';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';

/** All published pages in one language, each with its one-line answer. */
export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const { pages } = await apiGet<{ pages: PageListItem[] }>(`/pages?lang=${lang}&status=published&limit=1000`);
  const origin = env.publicOrigin;
  const sorted = [...pages].sort((a, b) => a.title.localeCompare(b.title, lang));
  const body = [
    `# is.gratis (${LANGUAGE_NAMES[lang]})`,
    '',
    `> ${messages(lang).tagline}`,
    '',
    '## Pages',
    '',
    ...sorted.map((page) => {
      const verdict = VERDICT_LABELS[lang][page.verdict];
      const summary = plainText(page.summary, 200);
      // Most summaries already open with the verdict; do not repeat it.
      const answer = summary.toLowerCase().startsWith(verdict.toLowerCase()) ? summary : `${verdict}. ${summary}`;
      return `- [${questionFor(lang, page.title)}](${origin}/${lang}/${page.slug}/llms.txt): ${answer}`;
    }),
    '',
  ].join('\n');
  return textResponse(body, 'public, max-age=0, s-maxage=600');
}
