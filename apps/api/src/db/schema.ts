/**
 * Database schema.
 *
 * A topic is a language independent concept ("water"). A page is that topic in one
 * language with its own slug (nl/water, es/agua). Every edit creates a full revision
 * snapshot; the page points at its current revision. Draft jobs are the queue for
 * LLM-written first versions, and sponsored offers are the paid "free here" blocks.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  DraftJobStatus,
  Language,
  PageContent,
  PageStatus,
  Region,
  RevisionSource,
  SponsorRequestStatus,
  UserRole,
} from '@isgratis/types';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('user'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself only lives in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable English key, e.g. "water" or "public-transport". */
  key: text('key').notNull().unique(),
  createdAt: createdAt(),
});

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    lang: text('lang').$type<Language>().notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    status: text('status').$type<PageStatus>().notNull().default('draft'),
    currentRevisionId: uuid('current_revision_id').references((): AnyPgColumn => revisions.id),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('pages_lang_slug_idx').on(table.lang, table.slug),
    uniqueIndex('pages_topic_lang_idx').on(table.topicId, table.lang),
    index('pages_lang_updated_idx').on(table.lang, table.updatedAt),
  ],
);

export const revisions = pgTable(
  'revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    content: jsonb('content').$type<PageContent>().notNull(),
    editSummary: text('edit_summary').notNull().default(''),
    source: text('source').$type<RevisionSource>().notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('revisions_page_number_idx').on(table.pageId, table.number)],
);

export const draftJobs = pgTable(
  'draft_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lang: text('lang').$type<Language>().notNull(),
    slug: text('slug').notNull(),
    status: text('status').$type<DraftJobStatus>().notNull().default('queued'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    /** Salted hash of the requester's IP, for rate limiting without storing the IP. */
    ipHash: text('ip_hash').notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('draft_jobs_status_created_idx').on(table.status, table.createdAt),
    index('draft_jobs_ip_created_idx').on(table.ipHash, table.createdAt),
    // At most one open job per page address.
    uniqueIndex('draft_jobs_open_idx')
      .on(table.lang, table.slug)
      .where(sql`status in ('queued', 'running')`),
  ],
);

export const sponsoredOffers = pgTable(
  'sponsored_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lang: text('lang').$type<Language>().notNull(),
    slug: text('slug').notNull(),
    region: text('region').$type<Region>(),
    advertiserName: text('advertiser_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
    message: text('message'),
    status: text('status').$type<SponsorRequestStatus>().notNull().default('pending'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('sponsored_offers_page_idx').on(table.lang, table.slug, table.status)],
);

export type UserRow = typeof users.$inferSelect;
export type PageRow = typeof pages.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;
export type DraftJobRow = typeof draftJobs.$inferSelect;
export type SponsoredOfferRow = typeof sponsoredOffers.$inferSelect;
