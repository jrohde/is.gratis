/**
 * The bot: scheduled tasks for is.gratis, such as posting the free thing of the day.
 *
 * A task says when it is due and under which key; the key makes a run happen exactly once.
 * Before running, a replica claims the key in Postgres. Another replica, or the same one after a
 * restart, sees the claim and skips it. A failed run is tried again on the next tick, at most
 * three times; a run that hangs is taken over after a quarter of an hour.
 *
 * Adding a task means adding an entry to the list in tasks.ts; nothing here changes.
 */
import { desc, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { botRuns } from '../db/schema.js';

export interface BotContext {
  db: Database;
  now: Date;
  logger: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}

export interface BotTask {
  name: string;
  /** Keys of the runs that are due now; an empty list when nothing is due. */
  due: (now: Date) => string[];
  /** Does the work for one key and returns a short note for the admin screen. */
  run: (ctx: BotContext, key: string) => Promise<string>;
}

const MAX_ATTEMPTS = 3;
const STALE_MINUTES = 15;

/** Takes a run for this replica; false when it is done, running elsewhere or out of attempts. */
export async function claim(db: Database, task: string, key: string): Promise<boolean> {
  const result = await db.execute(sql`
    insert into bot_runs (task, key, status) values (${task}, ${key}, 'running')
    on conflict (task, key) do update
      set status = 'running', attempts = bot_runs.attempts + 1, updated_at = now()
      where (bot_runs.status = 'failed' and bot_runs.attempts < ${MAX_ATTEMPTS})
         or (bot_runs.status = 'running' and bot_runs.updated_at < now() - make_interval(mins => ${STALE_MINUTES}))
    returning task
  `);
  return result.rows.length > 0;
}

async function finish(db: Database, task: string, key: string, status: 'done' | 'failed', detail: string) {
  await db.execute(sql`
    update bot_runs set status = ${status}, detail = ${detail.slice(0, 1000)}, updated_at = now()
    where task = ${task} and key = ${key}
  `);
}

/** One pass over all tasks: runs whatever is due and not yet done. Returns the runs it did. */
export async function tick(ctx: BotContext, tasks: BotTask[]): Promise<number> {
  let ran = 0;
  for (const task of tasks) {
    for (const key of task.due(ctx.now)) {
      if (!(await claim(ctx.db, task.name, key))) continue;
      ran++;
      try {
        const detail = await task.run(ctx, key);
        await finish(ctx.db, task.name, key, 'done', detail);
        ctx.logger.info({ task: task.name, key, detail }, 'bot task done');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finish(ctx.db, task.name, key, 'failed', message);
        ctx.logger.warn({ task: task.name, key, error: message }, 'bot task failed');
      }
    }
  }
  return ran;
}

export async function recentRuns(db: Database, limit: number) {
  const rows = await db.select().from(botRuns).orderBy(desc(botRuns.updatedAt)).limit(limit);
  return rows.map((row) => ({
    task: row.task,
    key: row.key,
    status: row.status,
    attempts: row.attempts,
    detail: row.detail,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** "08:00" in UTC: due from that time on, for the rest of the day. */
export function dailyAt(time: string, now: Date): boolean {
  const [hours, minutes] = time.split(':').map(Number);
  return now.getUTCHours() * 60 + now.getUTCMinutes() >= (hours ?? 0) * 60 + (minutes ?? 0);
}

export const today = (now: Date) => now.toISOString().slice(0, 10);
