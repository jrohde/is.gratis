/**
 * A public MCP server (Model Context Protocol), so AI agents can ask is.gratis directly.
 *
 * Streamable HTTP in stateless mode: every request gets its own server instance and the answer
 * comes back as plain JSON. Nothing is kept between requests, so it scales like the rest of the
 * API and passes through Varnish. All tools are read-only.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  LANGUAGES,
  REGIONS,
  VERDICT_LABELS,
  regionName,
  pageToLlmsText,
  questionFor,
  toSlug,
  type Language,
  type Page,
} from '@isgratis/types';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { HttpError } from '../lib/errors.js';
import { getPage, listPages, searchPages } from '../services/pages.js';
import { regionEntries } from '../services/regions.js';
import { searchFull } from '../services/search.js';

const INSTRUCTIONS = `is.gratis answers one question per subject: is it free? Each page has a verdict (yes, no, usually, it depends),
when it is and is not free, differences per country, and a 0 to 5 free scale based on who pays and when.
Use is_it_free for a direct question, search when the subject is vague, and cite the page URL in your answer.
Pages marked as draft were written by a language model and not reviewed yet: say so when you use them.`;

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

export function buildMcpServer(db: Database, origin: string): McpServer {
  const server = new McpServer({ name: 'is.gratis', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  const langSchema = z.enum(LANGUAGES).default('en').describe('Language of the page: nl, en, de or es');

  const pageMarkdown = (page: Page) =>
    pageToLlmsText({
      lang: page.lang,
      title: page.title,
      content: page.content,
      status: page.status,
      url: `${origin}/${page.lang}/${page.slug}`,
      updatedAt: page.updatedAt,
      revision: page.currentRevision.number,
      translations: page.translations.map((t) => ({ lang: t.lang, url: `${origin}/${t.lang}/${t.slug}` })),
    });

  const findPage = async (lang: Language, slug: string): Promise<Page | null> => {
    try {
      return await getPage(db, lang, slug);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 404) return null;
      throw error;
    }
  };

  server.registerTool(
    'is_it_free',
    {
      title: 'Is it free?',
      description:
        'Answers whether something is free (water, public transport, a museum, a service), with the conditions, regional differences and sources. Returns the page as Markdown.',
      inputSchema: {
        subject: z.string().trim().min(1).max(80).describe('What to look up, e.g. "tap water" or "openbaar vervoer"'),
        lang: langSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ subject, lang }) => {
      const direct = await findPage(lang, toSlug(subject));
      if (direct) return text(pageMarkdown(direct));
      const [best] = await searchPages(db, lang, subject, 1);
      const match = best ? await findPage(lang, best.slug) : null;
      if (match) return text(pageMarkdown(match));
      const slug = toSlug(subject);
      return text(
        `No page about "${subject}" in ${lang} yet. A first version can be requested at ${origin}/${lang}/${slug}. ` +
          'Try search with other words, or another language.',
      );
    },
  );

  server.registerTool(
    'free_in_country',
    {
      title: 'What is free in a country?',
      description:
        'Lists every subject with a specific answer for one country or area (ISO code such as NL, US, DE, or EU and WORLD), with the verdict and the text for that country.',
      inputSchema: {
        region: z.enum(REGIONS).describe('ISO 3166-1 alpha-2 code, or EU or WORLD'),
        lang: langSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ region, lang }) => {
      const entries = await regionEntries(db, region, lang);
      const name = regionName(region, lang);
      if (entries.length === 0) return text(`No pages in ${lang} have an answer specific to ${name} yet.`);
      return text(
        `# ${name}\n\n${origin}/regions/${lang}/${region.toLowerCase()}\n\n` +
          entries
            .map(
              (entry) =>
                `## ${questionFor(lang, entry.title)} ${VERDICT_LABELS[lang][entry.verdict]}.\n${origin}/${lang}/${entry.slug}\n\n${entry.text}`,
            )
            .join('\n\n'),
      );
    },
  );

  server.registerTool(
    'search',
    {
      title: 'Search is.gratis',
      description: 'Finds pages by any word in their text, in that language (stemmed). Returns titles, verdicts, short answers and URLs.',
      inputSchema: {
        query: z.string().trim().min(1).max(80),
        lang: langSchema,
        limit: z.number().int().min(1).max(20).default(8),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, lang, limit }) => {
      // Full text with stemming first; the title search catches half-typed words.
      const full = await searchFull(db, lang, query, { limit, offset: 0 });
      const results = full.results.length ? full.results : await searchPages(db, lang, query, limit);
      if (results.length === 0) return text(`No pages match "${query}" in ${lang}.`);
      return text(
        results
          .map(
            (page) =>
              `- ${questionFor(lang, page.title)} ${VERDICT_LABELS[lang][page.verdict]}.${page.status === 'draft' ? ' (draft)' : ''} ` +
              `${origin}/${lang}/${page.slug}\n  ${page.summary.replace(/\s+/g, ' ')}`,
          )
          .join('\n'),
      );
    },
  );

  server.registerTool(
    'get_page',
    {
      title: 'Get a page',
      description: 'Returns one page as Markdown, by language and slug (the last part of its URL).',
      inputSchema: {
        lang: langSchema,
        slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lang, slug }) => {
      const page = await findPage(lang, slug);
      return text(page ? pageMarkdown(page) : `No page ${lang}/${slug}.`);
    },
  );

  server.registerTool(
    'recent_changes',
    {
      title: 'Recent changes',
      description: 'Lists the most recently updated published pages in a language.',
      inputSchema: { lang: langSchema, limit: z.number().int().min(1).max(50).default(20) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lang, limit }) => {
      const pages = await listPages(db, { lang, status: 'published', limit, offset: 0 });
      return text(
        pages
          .map((page) => `- ${page.updatedAt.slice(0, 10)} ${questionFor(lang, page.title)} ${VERDICT_LABELS[lang][page.verdict]}. ${origin}/${lang}/${page.slug}`)
          .join('\n') || 'No pages yet.',
      );
    },
  );

  return server;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'mcp-session-id',
};

export const mcpRoutes: FastifyPluginAsync<{ db: Database; config: Config }> = async (app, { db, config }) => {
  app.post(
    '/mcp',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { tags: ['mcp'], summary: 'MCP server (Streamable HTTP, stateless, read-only tools)' },
    },
    async (request, reply) => {
      const server = buildMcpServer(db, config.publicOrigin);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack();
      for (const [name, value] of Object.entries(CORS_HEADERS)) reply.raw.setHeader(name, value);
      reply.raw.setHeader('cache-control', 'no-store');
      reply.raw.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  );

  app.options('/mcp', async (_request, reply) => reply.headers(CORS_HEADERS).code(204).send());

  // Stateless server: there is no event stream to open and no session to end.
  const notAllowed = async (_request: unknown, reply: import('fastify').FastifyReply) =>
    reply
      .headers({ ...CORS_HEADERS, allow: 'POST, OPTIONS' })
      .code(405)
      .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: use POST' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
};
