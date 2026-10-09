import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { PageContent } from '@isgratis/types';
import { buildApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { createDatabase } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/isgratis_test';
}

export async function createTestApp(overrides: Partial<Config> = {}) {
  const config: Config = {
    ...loadConfig(),
    databaseUrl: testDatabaseUrl(),
    adminEmails: ['admin@example.com'],
    trustedOrigins: ['https://is.gratis', 'https://*.is.gratis'],
    ...overrides,
  };
  const { db, pool } = createDatabase(config.databaseUrl, 5);
  const purged: string[] = [];
  const cache: CacheInvalidator = {
    purgePage: async (lang, slug) => {
      purged.push(`${lang}/${slug}`);
    },
  };
  const app = await buildApp({ config, db, cache, logger: pino({ level: 'silent' }) });
  await app.ready();
  return {
    app,
    db,
    config,
    cache,
    purged,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export type TestContext = Awaited<ReturnType<typeof createTestApp>>;

export async function resetDatabase(ctx: TestContext) {
  await ctx.db.execute(
    sql`truncate table related_subjects, search_misses, comments, watches, page_views, source_checks, sessions, sponsored_offers, draft_jobs, assets, revisions, pages, topics, users restart identity cascade`,
  );
}

/** Registers a user and returns the session cookie header. */
export async function register(ctx: TestContext, email: string, displayName = 'Tester') {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'correct horse battery', displayName },
  });
  if (response.statusCode !== 201) throw new Error(`register failed: ${response.body}`);
  const cookie = response.cookies.find((c) => c.name === 'isg_session');
  return { cookie: `isg_session=${cookie!.value}`, user: response.json().user };
}

export function sampleContent(overrides: Partial<PageContent> = {}): PageContent {
  return {
    verdict: 'depends',
    summary: 'Hangt ervan af.',
    whenFree: '- Soms',
    whenNotFree: '- Soms niet',
    background: '',
    facts: [],
    trivia: [],
    regions: [{ region: 'NL', verdict: 'depends', text: 'Per gemeente verschillend.' }],
    sources: [{ id: 'voorbeeld', title: 'Voorbeeld', url: 'https://example.com' }],
    ...overrides,
  };
}
