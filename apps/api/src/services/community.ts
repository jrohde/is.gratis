/** Watchlists and talk pages. */
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { Comment, Language, WatchItem } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { comments, pages, revisions, users, watches } from '../db/schema.js';
import { notFound } from '../lib/errors.js';

async function pageId(db: Database, lang: Language, slug: string): Promise<string> {
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.lang, lang), eq(pages.slug, slug)))
    .limit(1);
  if (!page) throw notFound('This page does not exist yet');
  return page.id;
}

async function currentNumber(db: Database, id: string): Promise<number> {
  const [row] = await db
    .select({ number: revisions.number })
    .from(pages)
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(eq(pages.id, id))
    .limit(1);
  return row?.number ?? 0;
}

/** Follows a page, or marks its current revision as seen when already followed. */
export async function watchPage(db: Database, userId: string, lang: Language, slug: string): Promise<void> {
  const id = await pageId(db, lang, slug);
  const seenRevision = await currentNumber(db, id);
  await db
    .insert(watches)
    .values({ userId, pageId: id, seenRevision })
    .onConflictDoUpdate({ target: [watches.userId, watches.pageId], set: { seenRevision } });
}

export async function unwatchPage(db: Database, userId: string, lang: Language, slug: string): Promise<void> {
  const id = await pageId(db, lang, slug);
  await db.delete(watches).where(and(eq(watches.userId, userId), eq(watches.pageId, id)));
}

export async function isWatching(db: Database, userId: string, lang: Language, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: watches.userId })
    .from(watches)
    .innerJoin(pages, eq(pages.id, watches.pageId))
    .where(and(eq(watches.userId, userId), eq(pages.lang, lang), eq(pages.slug, slug)))
    .limit(1);
  return Boolean(row);
}

/** The pages a user follows, changed ones first. */
export async function watchlist(db: Database, userId: string): Promise<WatchItem[]> {
  const rows = await db
    .select({ page: pages, number: revisions.number, content: revisions.content, seen: watches.seenRevision })
    .from(watches)
    .innerJoin(pages, eq(pages.id, watches.pageId))
    .innerJoin(revisions, eq(revisions.id, pages.currentRevisionId))
    .where(eq(watches.userId, userId))
    .orderBy(sql`${revisions.number} > ${watches.seenRevision} desc`, desc(pages.updatedAt))
    .limit(500);
  return rows.map(({ page, number, content, seen }) => ({
    lang: page.lang,
    slug: page.slug,
    title: page.title,
    ...(content.emoji ? { emoji: content.emoji } : {}),
    revision: number,
    seenRevision: seen,
    updatedAt: page.updatedAt.toISOString(),
  }));
}

export async function listComments(
  db: Database,
  lang: Language,
  slug: string,
  includeHidden: boolean,
): Promise<Comment[]> {
  const id = await pageId(db, lang, slug);
  const rows = await db
    .select({ comment: comments, authorName: users.displayName })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.pageId, id), includeHidden ? undefined : eq(comments.hidden, false)))
    .orderBy(asc(comments.createdAt))
    .limit(1000);
  return rows.map(({ comment, authorName }) => ({
    id: comment.id,
    authorName,
    body: comment.body,
    hidden: comment.hidden,
    createdAt: comment.createdAt.toISOString(),
  }));
}

export async function addComment(db: Database, userId: string, lang: Language, slug: string, body: string) {
  const id = await pageId(db, lang, slug);
  const [row] = await db.insert(comments).values({ pageId: id, userId, body }).returning();
  return row!;
}

export async function setCommentHidden(db: Database, id: string, hidden: boolean) {
  const [row] = await db.update(comments).set({ hidden }).where(eq(comments.id, id)).returning();
  if (!row) throw notFound('Message not found');
  return row;
}

export async function commentCount(db: Database, id: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.pageId, id), eq(comments.hidden, false)));
  return row?.n ?? 0;
}
