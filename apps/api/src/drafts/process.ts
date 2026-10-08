/**
 * Processes one draft job: ask the LLM, validate, store as a draft page, purge the cache.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { HttpError } from '../lib/errors.js';
import { LlmError, writeDraft, type DraftResult } from '../lib/llm.js';
import { claimNextJob, finishJob } from '../services/drafts.js';
import { getPage, saveRevision } from '../services/pages.js';

export interface WorkerDeps {
  db: Database;
  config: Pick<Config, 'llm' | 'drafts'>;
  cache: CacheInvalidator;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  /** Injectable for tests. */
  write?: typeof writeDraft;
}

/** Returns false when the queue was empty. */
export async function processNextJob(deps: WorkerDeps): Promise<boolean> {
  const job = await claimNextJob(deps.db);
  if (!job) return false;
  const log = { jobId: job.id, lang: job.lang, slug: job.slug, attempt: job.attempts };
  deps.logger.info(log, 'writing draft');

  let result: DraftResult;
  try {
    result = await (deps.write ?? writeDraft)(deps.config.llm, job.lang, job.slug);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = error instanceof LlmError && job.attempts < deps.config.drafts.maxAttempts;
    deps.logger.warn({ ...log, error: message, retry }, 'draft failed');
    await finishJob(deps.db, job.id, { status: retry ? 'queued' : 'failed', error: message });
    return true;
  }

  if (!result.ok) {
    deps.logger.info({ ...log, reason: result.reason }, 'subject rejected by the model');
    await finishJob(deps.db, job.id, { status: 'failed', error: `not_a_topic: ${result.reason}` });
    return true;
  }

  try {
    await saveRevision(deps.db, {
      lang: job.lang,
      slug: job.slug,
      title: result.title,
      content: result.content,
      editSummary: 'Eerste versie, geschreven door een taalmodel',
      baseRevisionId: null,
      authorId: null,
      source: 'llm',
      topicKey: result.topicKey,
    });
  } catch (error) {
    // Someone wrote the page by hand while the model was busy: their version wins.
    if (!(error instanceof HttpError && error.code === 'page_exists')) throw error;
  }
  const page = await getPage(deps.db, job.lang, job.slug);
  await finishJob(deps.db, job.id, { status: 'done', pageId: page.id });
  await deps.cache.purgePage(job.lang, job.slug);
  deps.logger.info(log, 'draft stored');
  return true;
}
