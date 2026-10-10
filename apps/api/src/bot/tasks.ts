/**
 * The bot's tasks. To add one: write a BotTask and put it in the list that buildTasks returns.
 */
import { sql } from 'drizzle-orm';
import { claimFor, footnoteFor, type Language, type PageListItem } from '@isgratis/types';
import type { CacheInvalidator } from '../lib/cache.js';
import { dailyPick } from '../services/daily.js';
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

export function buildTasks(options: { channels: Channel[]; dailyTime: string; origin: string; cache: CacheInvalidator }): BotTask[] {
  return [postDaily(options.channels, { time: options.dailyTime, origin: options.origin }), expireOffers(options.cache)];
}
