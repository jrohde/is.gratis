/**
 * The queue for LLM work: first drafts of pages and generated illustrations. It lives in
 * Postgres (FOR UPDATE SKIP LOCKED), so any number of worker replicas can share it without
 * Redis or another broker.
 */
import { and, count, desc, eq, gt, gte, inArray, like, lt, sql } from 'drizzle-orm';
import type { DraftJob, DraftJobKind, Language } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { assets, draftJobs, pages, type AssetRow, type DraftJobRow } from '../db/schema.js';
import { conflict, notFound, tooManyRequests } from '../lib/errors.js';

/** A running job older than this is assumed to belong to a crashed worker. */
const STALE_AFTER_MS = 10 * 60 * 1000;
/** How long a subject the model rejected stays rejected. */
const REJECTION_MEMORY_MS = 30 * 24 * 60 * 60 * 1000;

type AssetMeta = Pick<AssetRow, 'id' | 'width' | 'height' | 'source'> | null;

export function toDraftJob(row: DraftJobRow, asset: AssetMeta = null): DraftJob {
  return {
    id: row.id,
    kind: row.kind,
    lang: row.lang,
    slug: row.slug,
    status: row.status,
    error: row.error,
    asset: asset ? { id: asset.id, width: asset.width, height: asset.height, source: asset.source } : null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

const jobWithAsset = (db: Database) =>
  db
    .select({
      job: draftJobs,
      asset: { id: assets.id, width: assets.width, height: assets.height, source: assets.source },
    })
    .from(draftJobs)
    .leftJoin(assets, eq(assets.id, draftJobs.assetId));

export async function openJobFor(
  db: Database,
  lang: Language,
  slug: string,
  kind: DraftJobKind = 'page',
): Promise<DraftJob | null> {
  const [row] = await jobWithAsset(db)
    .where(and(eq(draftJobs.kind, kind), eq(draftJobs.lang, lang), eq(draftJobs.slug, slug)))
    .orderBy(desc(draftJobs.createdAt))
    .limit(1);
  return row ? toDraftJob(row.job, row.asset) : null;
}

export async function getJob(db: Database, id: string): Promise<DraftJob> {
  const [row] = await jobWithAsset(db).where(eq(draftJobs.id, id)).limit(1);
  if (!row) throw notFound('Draft job not found');
  return toDraftJob(row.job, row.asset);
}

export async function enqueueDraft(
  db: Database,
  input: { lang: Language; slug: string; ipHash: string; userId: string | null },
  limits: { perIpPerHour: number; globalPerHour: number },
): Promise<{ job: DraftJob; created: boolean }> {
  const [existingPage] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.lang, input.lang), eq(pages.slug, input.slug)))
    .limit(1);
  if (existingPage) throw conflict('page_exists', 'This page already exists');

  const [open] = await db
    .select()
    .from(draftJobs)
    .where(
      and(
        eq(draftJobs.kind, 'page'),
        eq(draftJobs.lang, input.lang),
        eq(draftJobs.slug, input.slug),
        inArray(draftJobs.status, ['queued', 'running']),
      ),
    )
    .limit(1);
  if (open) return { job: toDraftJob(open), created: false };

  // The model said this is not a subject; asking again would only cost money.
  const [rejected] = await db
    .select({ id: draftJobs.id })
    .from(draftJobs)
    .where(
      and(
        eq(draftJobs.kind, 'page'),
        eq(draftJobs.lang, input.lang),
        eq(draftJobs.slug, input.slug),
        eq(draftJobs.status, 'failed'),
        like(draftJobs.error, 'not_a_topic%'),
        gt(draftJobs.createdAt, new Date(Date.now() - REJECTION_MEMORY_MS)),
      ),
    )
    .limit(1);
  if (rejected) throw conflict('not_a_topic', 'This does not look like a subject we can write about');

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [[perIp], [global]] = await Promise.all([
    db
      .select({ n: count() })
      .from(draftJobs)
      .where(and(eq(draftJobs.kind, 'page'), eq(draftJobs.ipHash, input.ipHash), gt(draftJobs.createdAt, hourAgo))),
    db
      .select({ n: count() })
      .from(draftJobs)
      .where(and(eq(draftJobs.kind, 'page'), gt(draftJobs.createdAt, hourAgo))),
  ]);
  if ((perIp?.n ?? 0) >= limits.perIpPerHour) {
    throw tooManyRequests('You requested several new pages already. Try again in an hour.');
  }
  if ((global?.n ?? 0) >= limits.globalPerHour) {
    throw tooManyRequests('Many new pages are being written right now. Try again later.');
  }

  const [row] = await db
    .insert(draftJobs)
    .values({ lang: input.lang, slug: input.slug, ipHash: input.ipHash, requestedBy: input.userId })
    .onConflictDoNothing()
    .returning();
  if (row) return { job: toDraftJob(row), created: true };
  // Lost a race with an identical request: return the job that won.
  const job = await openJobFor(db, input.lang, input.slug, 'page');
  if (!job) throw conflict('draft_race', 'Try again');
  return { job, created: false };
}

/**
 * Claims the oldest queued job. Jobs left running by a crashed worker are queued again, or
 * failed once they used up their attempts, so a poisonous job cannot loop forever.
 */
export async function claimNextJob(db: Database, maxAttempts: number): Promise<DraftJobRow | null> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  await db
    .update(draftJobs)
    .set({ status: 'failed', error: 'Worker stopped while writing this draft', finishedAt: new Date() })
    .where(
      and(eq(draftJobs.status, 'running'), lt(draftJobs.startedAt, staleBefore), gte(draftJobs.attempts, maxAttempts)),
    );
  await db
    .update(draftJobs)
    .set({ status: 'queued' })
    .where(and(eq(draftJobs.status, 'running'), lt(draftJobs.startedAt, staleBefore)));

  const result = await db.execute<{ id: string }>(sql`
    update ${draftJobs}
    set status = 'running', started_at = now(), attempts = attempts + 1
    where id = (
      select id from ${draftJobs}
      where status = 'queued'
      order by created_at
      for update skip locked
      limit 1
    )
    returning id
  `);
  const id = result.rows[0]?.id;
  if (!id) return null;
  const [row] = await db.select().from(draftJobs).where(eq(draftJobs.id, id)).limit(1);
  return row ?? null;
}

export async function finishJob(
  db: Database,
  id: string,
  outcome:
    | { status: 'done'; pageId: string | null; assetId?: string }
    | { status: 'failed' | 'queued'; error: string },
): Promise<void> {
  await db
    .update(draftJobs)
    .set(
      outcome.status === 'done'
        ? { status: 'done', pageId: outcome.pageId, assetId: outcome.assetId ?? null, error: null, finishedAt: new Date() }
        : {
            status: outcome.status,
            error: outcome.error.slice(0, 1000),
            finishedAt: outcome.status === 'failed' ? new Date() : null,
          },
    )
    .where(eq(draftJobs.id, id));
}

/**
 * Queues an illustration for an existing page. People are limited per account, the worker's
 * own requests (userId null) only by the global limit.
 */
export async function enqueueImage(
  db: Database,
  input: { lang: Language; slug: string; userId: string | null; ipHash: string; attach: boolean },
  limits: { perUserPerHour: number; globalPerHour: number },
): Promise<{ job: DraftJob; created: boolean }> {
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.lang, input.lang), eq(pages.slug, input.slug)))
    .limit(1);
  if (!page) throw notFound('This page does not exist yet');

  const open = await db
    .select({ id: draftJobs.id })
    .from(draftJobs)
    .where(
      and(
        eq(draftJobs.kind, 'image'),
        eq(draftJobs.lang, input.lang),
        eq(draftJobs.slug, input.slug),
        inArray(draftJobs.status, ['queued', 'running']),
      ),
    )
    .limit(1);
  if (open[0]) return { job: await getJob(db, open[0].id), created: false };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = and(eq(draftJobs.kind, 'image'), gt(draftJobs.createdAt, hourAgo));
  const [[mine], [global]] = await Promise.all([
    input.userId
      ? db.select({ n: count() }).from(draftJobs).where(and(recent, eq(draftJobs.requestedBy, input.userId)))
      : Promise.resolve([{ n: 0 }]),
    db.select({ n: count() }).from(draftJobs).where(recent),
  ]);
  if ((mine?.n ?? 0) >= limits.perUserPerHour) {
    throw tooManyRequests('You generated several images already. Try again in an hour.');
  }
  if ((global?.n ?? 0) >= limits.globalPerHour) {
    throw tooManyRequests('Many images are being generated right now. Try again later.');
  }
  const [row] = await db
    .insert(draftJobs)
    .values({
      kind: 'image',
      lang: input.lang,
      slug: input.slug,
      ipHash: input.ipHash,
      requestedBy: input.userId,
      pageId: page.id,
      attach: input.attach,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { job: toDraftJob(row), created: true };
  const job = await openJobFor(db, input.lang, input.slug, 'image');
  if (!job) throw conflict('draft_race', 'Try again');
  return { job, created: false };
}

export async function queuedJobCount(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(draftJobs).where(eq(draftJobs.status, 'queued'));
  return row?.n ?? 0;
}
