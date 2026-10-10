/**
 * The bot's tasks. To add one: write a BotTask and put it in the list that buildTasks returns.
 */
import { sql } from 'drizzle-orm';
import { LANGUAGES, claimFor, footnoteFor, type Language, type PageListItem } from '@isgratis/types';
import type { CacheInvalidator } from '../lib/cache.js';
import { HttpError } from '../lib/errors.js';
import { hashIp } from '../lib/hash.js';
import { dailyPick } from '../services/daily.js';
import { enqueueDraft } from '../services/drafts.js';
import { reviewDrafts, type EditorDeps } from '../services/editorial.js';
import { wantedSubjects } from '../services/search.js';
import type { Channel } from './publishers.js';
import { dailyAt, today, type BotTask } from './scheduler.js';

/** "Lucht is gratis* *echt", the short answer, and the link; shortened to fit the channel. */
export function composePost(page: PageListItem, link: string, maxLength: number): string {
  const head = `${claimFor(page.lang, page.title, page.plural)}* *${footnoteFor(page.lang, page).text}`;
  const summary = page.summary.replace(/\[\^[a-z0-9-]+\]/g, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
  const room = maxLength - head.length - link.length - 4;
  const body = room < 20 ? '' : summary.length > room ? `${summary.slice(0, room - 1).trimEnd()}…` : summary;
  return [head, body, link].filter(Boolean).join('\n\n');
}

/** Posts the free thing of the day, once a day per channel, from the configured time (UTC). */
export function postDaily(channels: Channel[], options: { time: string; origin: string }): BotTask {
  return {
    name: 'post-daily',
    due: (now) => (dailyAt(options.time, now) ? channels.map((channel) => `${channel.id}:${today(now)}`) : []),
    run: async (ctx, key) => {
      const day = key.slice(-10);
      const channel = channels.find((c) => key === `${c.id}:${day}`);
      if (!channel) return 'channel no longer configured';
      const page = await dailyPick(ctx.db, channel.lang, day);
      if (!page) return 'nothing to post yet';
      const link = `${options.origin}/${page.lang}/${page.slug}`;
      return channel.publish({
        text: composePost(page, link, channel.maxLength),
        link,
        lang: channel.lang as Language,
        idempotencyKey: `isgratis-${key}`,
      });
    },
  };
}

/** Every hour: offers past their end date stop showing as "active" in the admin screen too. */
export function expireOffers(cache: CacheInvalidator): BotTask {
  return {
    name: 'expire-offers',
    due: (now) => [now.toISOString().slice(0, 13)],
    run: async (ctx) => {
      const result = await ctx.db.execute<{ lang: string; slug: string }>(sql`
        update sponsored_offers set status = 'expired'
        where status = 'active' and ends_at is not null and ends_at < now()
        returning lang, slug
      `);
      for (const row of result.rows) await cache.purgePage(row.lang, row.slug);
      return `${result.rows.length} expired`;
    },
  };
}

/**
 * Every night: queue first drafts for the subjects people want most and that have no page yet,
 * judged by searches without a result and links to missing pages. The worker writes them.
 */
export function draftWanted(options: { perDay: number; time: string; minWeight: number; globalPerHour: number; ipHashSalt: string }): BotTask {
  return {
    name: 'draft-wanted',
    due: (now) => (options.perDay > 0 && dailyAt(options.time, now) ? [today(now)] : []),
    run: async (ctx) => {
      const ipHash = hashIp('bot', options.ipHashSalt);
      const queued: string[] = [];
      for (const lang of LANGUAGES) {
        // A missing translation is a job for the translator, not for a new draft.
        const wanted = (await wantedSubjects(ctx.db, lang, 100)).filter((s) => s.reason !== 'translation' && s.weight >= options.minWeight);
        let count = 0;
        for (const subject of wanted) {
          if (count >= options.perDay) break;
          try {
            const { created } = await enqueueDraft(
              ctx.db,
              { lang, slug: subject.slug, ipHash, userId: null },
              { perIpPerHour: Number.POSITIVE_INFINITY, globalPerHour: options.globalPerHour },
            );
            if (created) {
              count++;
              queued.push(`${lang}/${subject.slug}`);
            }
          } catch (error) {
            if (!(error instanceof HttpError)) throw error;
            if (error.code === 'rate_limited') return `queued ${queued.length} before the hourly limit: ${queued.join(', ')}`;
          }
        }
      }
      return queued.length ? `queued ${queued.length}: ${queued.join(', ')}` : 'nothing wanted enough';
    },
  };
}

/** Every ten minutes: the editorial language model reads the drafts that are waiting. */
export function editorDesk(deps: Omit<EditorDeps, 'db'>, perRun: number): BotTask {
  return {
    name: 'editor',
    due: (now) => [now.toISOString().slice(0, 15)],
    run: (ctx) => reviewDrafts({ ...deps, db: ctx.db }, perRun),
  };
}

/** Every day: forget bot runs older than a month. */
export function housekeeping(): BotTask {
  return {
    name: 'housekeeping',
    due: (now) => [today(now)],
    run: async (ctx) => {
      const result = await ctx.db.execute(sql`delete from bot_runs where updated_at < now() - interval '30 days'`);
      return `${result.rowCount ?? 0} old runs removed`;
    },
  };
}

export interface TaskOptions {
  channels: Channel[];
  dailyTime: string;
  origin: string;
  cache: CacheInvalidator;
  drafts?: Parameters<typeof draftWanted>[0];
  editor?: { deps: Omit<EditorDeps, 'db' | 'cache'>; perRun: number };
}

export function buildTasks(options: TaskOptions): BotTask[] {
  return [
    postDaily(options.channels, { time: options.dailyTime, origin: options.origin }),
    expireOffers(options.cache),
    housekeeping(),
    ...(options.drafts ? [draftWanted(options.drafts)] : []),
    ...(options.editor ? [editorDesk({ ...options.editor.deps, cache: options.cache }, options.editor.perRun)] : []),
  ];
}
