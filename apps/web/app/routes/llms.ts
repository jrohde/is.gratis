import { LANGUAGES } from '@isgratis/types';
import { env } from '~/lib/env.server';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { textResponse } from '~/lib/llms.server';

/** Site-wide llms.txt (https://llmstxt.org): what is.gratis is and where to find the rest. */
export function loader() {
  const origin = env.publicOrigin;
  const body = [
    '# is.gratis',
    '',
    '> The encyclopedia that answers one question: is it free? Every page gives a one-word verdict, explains when something is and is not free, lists the differences per country, and rates it on a 0 to 5 free scale based on who pays and when.',
    '',
    'Pages are written and improved by people. First versions written by a language model are marked as unreviewed drafts until a person checks them. Every page is also available as Markdown at its URL followed by /llms.txt.',
    '',
    '## Pages per language',
    '',
    ...LANGUAGES.map((lang) => `- [${LANGUAGE_NAMES[lang]}](${origin}/${lang}/llms.txt): ${messages(lang).tagline}`),
    '',
    '## Tools for AI agents',
    '',
    `- [MCP server](${origin}/api/mcp): Model Context Protocol over Streamable HTTP, no key, read-only. Tools: is_it_free, free_in_country, search, get_page, recent_changes`,
    `- [Developer overview](${origin}/developers?lang=en): MCP setup, REST API, llms.txt and RSS feeds`,
    '',
    '## Method',
    '',
    `- [How the free scale and time prices work](${origin}/methodology?lang=en): definitions, scientific basis and references`,
    '',
    '## Optional',
    '',
    `- [API documentation](${origin}/api/docs): JSON API for pages, revisions and drafts (OpenAPI)`,
    `- [Sitemap](${origin}/sitemap.xml)`,
    ...LANGUAGES.map((lang) => `- [RSS feed (${LANGUAGE_NAMES[lang]})](${origin}/${lang}/feed.xml): new and updated pages`),
    '',
  ].join('\n');
  return textResponse(body, 'public, max-age=0, s-maxage=3600');
}
