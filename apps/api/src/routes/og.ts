import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { languageSchema } from '../lib/content.js';
import { renderPageCard, renderSiteCard } from '../lib/og.js';
import { getPage } from '../services/pages.js';
import { HttpError } from '../lib/errors.js';

// The web app adds ?v=<revision> to the URL, so a new revision gets a new image everywhere.
const CACHE = 'public, max-age=86400, s-maxage=604800';

export const ogRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/og/site/:file',
    {
      schema: {
        tags: ['assets'],
        summary: 'Social sharing card for the site (1200 × 630 PNG)',
        params: z.object({ file: z.string().regex(/^(nl|en|de|es)\.png$/) }),
      },
    },
    async (request, reply) => {
      const lang = languageSchema.parse(request.params.file.slice(0, 2));
      const png = await renderSiteCard(lang);
      return reply.header('content-type', 'image/png').header('cache-control', CACHE).send(png);
    },
  );

  app.get(
    '/og/:lang/:file',
    {
      schema: {
        tags: ['assets'],
        summary: 'Social sharing card for a page (1200 × 630 PNG)',
        params: z.object({ lang: languageSchema, file: z.string().regex(/^[a-z0-9-]{1,64}\.png$/) }),
        querystring: z.object({ v: z.string().max(20).optional() }),
      },
    },
    async (request, reply) => {
      const { lang } = request.params;
      const slug = request.params.file.slice(0, -4);
      let png: Buffer;
      try {
        png = await renderPageCard(await getPage(db, lang, slug));
      } catch (error) {
        if (!(error instanceof HttpError && error.statusCode === 404)) throw error;
        png = await renderSiteCard(lang);
      }
      return reply.header('content-type', 'image/png').header('cache-control', CACHE).send(png);
    },
  );
};
