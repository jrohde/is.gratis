/**
 * Processes one job from the queue: a first draft of a page, or an illustration for a page.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Language } from '@isgratis/types';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { DraftJobRow } from '../db/schema.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { HttpError } from '../lib/errors.js';
import { hashIp } from '../lib/hash.js';
import { buildImagePrompt, generateImage } from '../lib/image-llm.js';
import { normalizeImage } from '../lib/images.js';
import { LlmError, translatePage, writeDraft, type DraftResult } from '../lib/llm.js';
import { storeAsset } from '../services/assets.js';
import { claimNextJob, enqueueImage, finishJob } from '../services/drafts.js';
import { getPage, saveRevision } from '../services/pages.js';
import { toSlug } from '@isgratis/types';

export interface WorkerDeps {
  db: Database;
  config: Pick<Config, 'llm' | 'drafts' | 'images' | 'ipHashSalt'>;
  cache: CacheInvalidator;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  /** Injectable for tests. */
  write?: typeof writeDraft;
  generate?: typeof generateImage;
  translate?: typeof translatePage;
}

const ALT_TEXT: Record<Language, (title: string) => string> = {
  nl: (title) => `Illustratie bij ${title}`,
  en: (title) => `Illustration of ${title}`,
  de: (title) => `Illustration zu ${title}`,
  es: (title) => `Ilustración sobre ${title}`,
};

async function failOrRetry(deps: WorkerDeps, job: DraftJobRow, error: unknown, log: object) {
  const message = error instanceof Error ? error.message : String(error);
  const retry = error instanceof LlmError && job.attempts < deps.config.drafts.maxAttempts;
  deps.logger.warn({ ...log, error: message, retry }, 'job failed');
  await finishJob(deps.db, job.id, { status: retry ? 'queued' : 'failed', error: message });
}

async function processPageJob(deps: WorkerDeps, job: DraftJobRow, log: object) {
  let result: DraftResult;
  try {
    result = await (deps.write ?? writeDraft)(deps.config.llm, job.lang, job.slug);
  } catch (error) {
    await failOrRetry(deps, job, error, log);
    return;
  }

  if (!result.ok) {
    deps.logger.info({ ...log, reason: result.reason }, 'subject rejected by the model');
    await finishJob(deps.db, job.id, { status: 'failed', error: `not_a_topic: ${result.reason}` });
    return;
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
    if (!(error instanceof HttpError && error.code === 'page_exists')) {
      const message = error instanceof Error ? error.message : String(error);
      deps.logger.error({ ...log, error: message }, 'storing draft failed');
      await finishJob(deps.db, job.id, { status: 'failed', error: `store_failed: ${message}` });
      return;
    }
  }
  const page = await getPage(deps.db, job.lang, job.slug);
  await finishJob(deps.db, job.id, { status: 'done', pageId: page.id });
  await deps.cache.purgePage(job.lang, job.slug);
  deps.logger.info(log, 'draft stored');

  if (deps.config.drafts.withImage && deps.config.images.enabled && !page.content.image) {
    await enqueueImage(
      deps.db,
      { lang: job.lang, slug: job.slug, userId: null, ipHash: hashIp('worker', deps.config.ipHashSalt), attach: true },
      { perUserPerHour: Number.POSITIVE_INFINITY, globalPerHour: deps.config.images.globalPerHour },
    ).catch((error: unknown) => deps.logger.warn({ ...log, error: String(error) }, 'could not queue an image'));
  }
}

async function processImageJob(deps: WorkerDeps, job: DraftJobRow, log: object) {
  if (!deps.config.images.enabled) {
    await finishJob(deps.db, job.id, { status: 'failed', error: 'Image generation is not configured' });
    return;
  }
  let page;
  try {
    page = await getPage(deps.db, job.lang, job.slug);
  } catch {
    await finishJob(deps.db, job.id, { status: 'failed', error: 'The page no longer exists' });
    return;
  }

  const prompt = buildImagePrompt(job.lang, page.title, page.content.summary);
  let asset;
  try {
    const raw = await (deps.generate ?? generateImage)(deps.config.images, prompt);
    const image = await normalizeImage(raw);
    asset = await storeAsset(deps.db, image, { source: 'ai', prompt, createdBy: job.requestedBy });
  } catch (error) {
    await failOrRetry(deps, job, error, log);
    return;
  }

  if (job.attach) {
    // Only fill an empty spot: never replace an image a person chose.
    const current = await getPage(deps.db, job.lang, job.slug);
    if (!current.content.image) {
      await saveRevision(deps.db, {
        lang: job.lang,
        slug: job.slug,
        title: current.title,
        content: {
          ...current.content,
          image: { assetId: asset.id, alt: ALT_TEXT[job.lang](current.title), width: asset.width, height: asset.height, ai: true },
        },
        editSummary: 'Afbeelding gegenereerd',
        baseRevisionId: current.currentRevision.id,
        authorId: null,
        source: 'llm',
      }).catch((error: unknown) => deps.logger.warn({ ...log, error: String(error) }, 'could not attach image'));
      await deps.cache.purgePage(job.lang, job.slug);
    }
  }
  await finishJob(deps.db, job.id, { status: 'done', pageId: page.id, assetId: asset.id });
  deps.logger.info({ ...log, assetId: asset.id }, 'image stored');
}

async function processTranslationJob(deps: WorkerDeps, job: DraftJobRow, log: object) {
  const from = job.sourceLang;
  let source;
  try {
    if (!from) throw new Error('missing source language');
    source = await getPage(deps.db, from, job.slug);
  } catch {
    await finishJob(deps.db, job.id, { status: 'failed', error: 'The page to translate no longer exists' });
    return;
  }
  if (source.translations.some((t) => t.lang === job.lang)) {
    await finishJob(deps.db, job.id, { status: 'failed', error: 'page_exists: translated in the meantime' });
    return;
  }

  let result;
  try {
    result = await (deps.translate ?? translatePage)(deps.config.llm, from!, job.lang, source);
  } catch (error) {
    await failOrRetry(deps, job, error, log);
    return;
  }
  const slug = toSlug(result.title);
  if (!slug) {
    await finishJob(deps.db, job.id, { status: 'failed', error: 'The translated title has no usable address' });
    return;
  }
  try {
    await saveRevision(deps.db, {
      lang: job.lang,
      slug,
      title: result.title,
      content: result.content,
      editSummary: `Vertaald uit het ${from} door een taalmodel`,
      baseRevisionId: null,
      authorId: null,
      source: 'llm',
      topicKey: source.topicKey,
    });
  } catch (error) {
    const message = error instanceof HttpError && error.code === 'page_exists'
      ? `page_exists: /${job.lang}/${slug} is another subject`
      : `store_failed: ${error instanceof Error ? error.message : String(error)}`;
    await finishJob(deps.db, job.id, { status: 'failed', error: message });
    return;
  }
  const page = await getPage(deps.db, job.lang, slug);
  await finishJob(deps.db, job.id, { status: 'done', pageId: page.id });
  // The source page lists its translations: refresh it too.
  await Promise.all([deps.cache.purgePage(job.lang, slug), deps.cache.purgePage(from!, job.slug)]);
  deps.logger.info({ ...log, target: `${job.lang}/${slug}` }, 'translation stored');
}

/** Returns false when the queue was empty. */
export async function processNextJob(deps: WorkerDeps): Promise<boolean> {
  const job = await claimNextJob(deps.db, deps.config.drafts.maxAttempts);
  if (!job) return false;
  const log = { jobId: job.id, kind: job.kind, lang: job.lang, slug: job.slug, attempt: job.attempts };
  deps.logger.info(log, 'processing job');
  if (job.kind === 'image') await processImageJob(deps, job, log);
  else if (job.kind === 'translation') await processTranslationJob(deps, job, log);
  else await processPageJob(deps, job, log);
  return true;
}
