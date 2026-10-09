/**
 * Translations by the language model: a published page becomes a draft in another language,
 * linked to the same topic, for a person to check. One good page can become four.
 */
import { and, count, eq, gt, sql } from 'drizzle-orm';
import type { DraftJob, Language } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { draftJobs, pages } from '../db/schema.js';
import { conflict, notFound, tooManyRequests } from '../lib/errors.js';
import { openJobFor, toDraftJob } from './drafts.js';

async function topicHasLanguage(db: Database, topicId: string, lang: Language): Promise<boolean> {
  const [row] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.topicId, topicId), eq(pages.lang, lang)))
    .limit(1);
  return Boolean(row);
}

export async function enqueueTranslation(
  db: Database,
  input: { from: Language; slug: string; to: Language; ipHash: string; userId: string | null },
  limits: { perIpPerHour: number; globalPerHour: number },
): Promise<{ job: DraftJob; created: boolean }> {
  if (input.from === input.to) throw conflict('same_language', 'Pick another language');
  const [source] = await db
    .select({ id: pages.id, topicId: pages.topicId, status: pages.status })
    .from(pages)
    .where(and(eq(pages.lang, input.from), eq(pages.slug, input.slug)))
    .limit(1);
  if (!source) throw notFound('This page does not exist');
  // Translating unchecked text would copy its mistakes into another language.
  if (source.status !== 'published') throw conflict('not_published', 'Only checked pages can be translated');
  if (await topicHasLanguage(db, source.topicId, input.to)) throw conflict('page_exists', 'This page exists in that language already');

  const open = await openJobFor(db, input.to, input.slug, 'translation');
  if (open && (open.status === 'queued' || open.status === 'running')) return { job: open, created: false };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = and(eq(draftJobs.kind, 'translation'), gt(draftJobs.createdAt, hourAgo));
  const [[perIp], [global]] = await Promise.all([
    db.select({ n: count() }).from(draftJobs).where(and(recent, eq(draftJobs.ipHash, input.ipHash))),
    db.select({ n: count() }).from(draftJobs).where(recent),
  ]);
  if ((perIp?.n ?? 0) >= limits.perIpPerHour) throw tooManyRequests('You asked for several translations already. Try again in an hour.');
  if ((global?.n ?? 0) >= limits.globalPerHour) throw tooManyRequests('Many translations are being written right now. Try again later.');

  const [row] = await db
    .insert(draftJobs)
    .values({
      kind: 'translation',
      lang: input.to,
      slug: input.slug,
      sourceLang: input.from,
      ipHash: input.ipHash,
      requestedBy: input.userId,
      pageId: source.id,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { job: toDraftJob(row), created: true };
  const job = await openJobFor(db, input.to, input.slug, 'translation');
  if (!job) throw conflict('draft_race', 'Try again');
  return { job, created: false };
}

/** Published pages in one language whose topic has no page in another language yet. */
export async function untranslated(db: Database, from: Language, to: Language, limit: number): Promise<string[]> {
  const rows = await db.execute<{ slug: string }>(sql`
    select p.slug from pages p
    where p.lang = ${from} and p.status = 'published'
      and not exists (select 1 from pages t where t.topic_id = p.topic_id and t.lang = ${to})
    order by p.updated_at desc
    limit ${limit}
  `);
  return rows.rows.map((row) => row.slug);
}

