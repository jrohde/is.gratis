/**
 * Inserts the starting pages. Idempotent: pages that already exist are left alone, so this is
 * safe to run on every deploy.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { pageContentSchema } from '../lib/content.js';
import { loadConfig } from '../config.js';
import { createDatabase, type Database } from './client.js';
import { runMigrations } from './migrate.js';
import { pages, revisions, topics } from './schema.js';
import { seedPages } from './seed-data.js';

export async function seed(db: Database): Promise<number> {
  let inserted = 0;
  for (const page of seedPages) {
    const content = pageContentSchema.parse(page.content);
    const created = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.lang, page.lang), eq(pages.slug, page.slug)))
        .limit(1);
      if (existing) return false;
      await tx.insert(topics).values({ key: page.topicKey }).onConflictDoNothing();
      const [topic] = await tx.select().from(topics).where(eq(topics.key, page.topicKey)).limit(1);
      const [row] = await tx
        .insert(pages)
        .values({ topicId: topic!.id, lang: page.lang, slug: page.slug, title: page.title, status: 'published' })
        .returning();
      const [revision] = await tx
        .insert(revisions)
        .values({
          pageId: row!.id,
          number: 1,
          title: page.title,
          content,
          editSummary: 'Startinhoud',
          source: 'seed',
        })
        .returning();
      await tx.update(pages).set({ currentRevisionId: revision!.id }).where(eq(pages.id, row!.id));
      return true;
    });
    if (created) inserted += 1;
  }
  return inserted;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = loadConfig().databaseUrl;
  (async () => {
    await runMigrations(url);
    const { db, pool } = createDatabase(url, 2);
    const count = await seed(db);
    console.log(`Seeded ${count} new page(s)`);
    await pool.end();
  })().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
