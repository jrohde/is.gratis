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
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  DraftJobKind,
  DraftJobStatus,
  EditorDecision,
  Language,
  MailingList,
  OfferEditorDecision,
  PageContent,
  PageStatus,
  Region,
  ReportReason,
  RevisionSource,
  SponsorRequestStatus,
  UserRole,
} from '@isgratis/types';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/** Full-text search document; filled by a trigger (see migration 0003), never by the app. */
const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

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
    searchDoc: tsvector('search_doc'),
    /** Only moderators may edit a protected page: against edit wars and vandalism. */
    protected: boolean('protected').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('pages_search_idx').using('gin', table.searchDoc),
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

/**
 * Images, normalised to WebP and stored in Postgres. They are served once per size and then
 * cached by Varnish forever (their URLs never change), so the database barely notices.
 */
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  sha256: text('sha256').notNull().unique(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: bytea('bytes').notNull(),
  source: text('source').$type<'upload' | 'ai'>().notNull(),
  prompt: text('prompt'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const draftJobs = pgTable(
  'draft_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** "page" writes a first version; "image" generates an illustration for a page. */
    kind: text('kind').$type<DraftJobKind>().notNull().default('page'),
    lang: text('lang').$type<Language>().notNull(),
    slug: text('slug').notNull(),
    status: text('status').$type<DraftJobStatus>().notNull().default('queued'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    /** Salted hash of the requester's IP, for rate limiting without storing the IP. */
    ipHash: text('ip_hash').notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    /** Translation jobs: the language of the page to translate (its slug is in slug). */
    sourceLang: text('source_lang').$type<Language>(),
    /** Image jobs: put the image on the page when it has none yet. */
    attach: boolean('attach').notNull().default(false),
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('draft_jobs_status_created_idx').on(table.status, table.createdAt),
    index('draft_jobs_ip_created_idx').on(table.ipHash, table.createdAt),
    // At most one open job of each kind per page address.
    uniqueIndex('draft_jobs_open_kind_idx')
      .on(table.kind, table.lang, table.slug)
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
    /** Monthly price quoted to the advertiser when they asked, in cents. */
    priceCents: integer('price_cents'),
    /** Secret in the advertiser's statistics link; they need no account. */
    statsToken: text('stats_token').unique(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** The editorial language model's advice; see lib/offer-editor.ts. */
    editorDecision: text('editor_decision').$type<OfferEditorDecision>(),
    editorNotes: text('editor_notes'),
    editorSuggestion: jsonb('editor_suggestion').$type<{ title?: string; description?: string }>(),
    editorCheckedAt: timestamp('editor_checked_at', { withTimezone: true }),
    /** Failed attempts; after three the editor leaves the offer to the admin. */
    editorAttempts: integer('editor_attempts').notNull().default(0),
    /** Booked extra: also in the weekly mail of free offers, for this monthly price. */
    inMailing: boolean('in_mailing').notNull().default(false),
    mailingPriceCents: integer('mailing_price_cents'),
    createdAt: createdAt(),
  },
  (table) => [index('sponsored_offers_page_idx').on(table.lang, table.slug, table.status)],
);

/**
 * Page views per day, counted by a beacon from the browser: no cookies, no IP addresses, and
 * bots that do not run JavaScript are left out. Basis for sponsor prices.
 */
export const pageViews = pgTable(
  'page_views',
  {
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.pageId, table.day] })],
);

/** How often an offer was shown and clicked, per day. No visitor data. */
export const offerStats = pgTable(
  'offer_stats',
  {
    offerId: uuid('offer_id')
      .notNull()
      .references(() => sponsoredOffers.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.offerId, table.day] })],
);

/** The last check of a source URL by the worker. */
export const sourceChecks = pgTable('source_checks', {
  url: text('url').primaryKey(),
  ok: boolean('ok').notNull(),
  status: integer('status'),
  error: text('error'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
});

/** Pages a user follows, with the revision they last saw. */
export const watches = pgTable(
  'watches',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    seenRevision: integer('seen_revision').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pageId] })],
);

/** The talk page of a subject: discussion about the page, separate from the page itself. */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index('comments_page_idx').on(table.pageId, table.createdAt)],
);

/**
 * Searches that found nothing, counted per day without anything about the searcher. Often
 * searched and never found means: this page should exist.
 */
export const searchMisses = pgTable(
  'search_misses',
  {
    lang: text('lang').$type<Language>().notNull(),
    query: text('query').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.lang, table.query, table.day] })],
);

/** Subjects related to a search, asked from the language model once per query. */
export const relatedSubjects = pgTable(
  'related_subjects',
  {
    lang: text('lang').$type<Language>().notNull(),
    query: text('query').notNull(),
    subjects: jsonb('subjects').$type<string[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.lang, table.query] }), index('related_subjects_created_idx').on(table.createdAt)],
);

/** Reports from readers: something on a page is wrong, outdated, spam or offensive. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    reason: text('reason').$type<ReportReason>().notNull(),
    message: text('message'),
    /** Salted hash of the reporter's IP, for rate limiting only. */
    ipHash: text('ip_hash').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').$type<'open' | 'resolved'>().notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('reports_status_idx').on(table.status, table.createdAt), index('reports_ip_idx').on(table.ipHash, table.createdAt)],
);

/**
 * What the bot did: one row per run of a task, keyed so every run happens once, also with
 * several bot replicas or after a restart. See src/bot/scheduler.ts.
 */
export const botRuns = pgTable(
  'bot_runs',
  {
    task: text('task').notNull(),
    /** Identifies one run, e.g. "nl:2026-10-10" for the post of that day. */
    key: text('key').notNull(),
    status: text('status').$type<'running' | 'done' | 'failed'>().notNull(),
    attempts: integer('attempts').notNull().default(1),
    detail: text('detail'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.task, table.key] }), index('bot_runs_updated_idx').on(table.updatedAt)],
);

export type UserRow = typeof users.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type PageRow = typeof pages.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;
export type DraftJobRow = typeof draftJobs.$inferSelect;
export type SponsoredOfferRow = typeof sponsoredOffers.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;

/**
 * What the editorial language model decided about a draft revision, and why. A revision is
 * reviewed once; "error" rows count failed attempts so a broken draft is not retried forever.
 */
export const editorReviews = pgTable(
  'editor_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => revisions.id, { onDelete: 'cascade' }),
    decision: text('decision').$type<EditorDecision>().notNull(),
    notes: text('notes').notNull(),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('editor_reviews_revision_idx').on(table.revisionId), index('editor_reviews_created_idx').on(table.createdAt)],
);

/**
 * Subscriptions to the mailing lists. Nothing is sent before the address is confirmed (double
 * opt-in); unsubscribing deletes the row. The token is in every mail's unsubscribe link.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    list: text('list').$type<MailingList>().notNull(),
    lang: text('lang').$type<Language>().notNull(),
    /** offers: only offers for this region (and those valid everywhere); null means all. */
    region: text('region').$type<Region>(),
    token: text('token').notNull().unique(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // One subscription per address and list, plus at most one waiting for confirmation: a change
    // of language or region replaces the current one only once it is confirmed.
    uniqueIndex('subscriptions_confirmed_idx').on(table.email, table.list).where(sql`confirmed_at is not null`),
    uniqueIndex('subscriptions_waiting_idx').on(table.email, table.list).where(sql`confirmed_at is null`),
    index('subscriptions_list_idx').on(table.list, table.lang),
  ],
);

/** Mail waiting to be sent by the bot, and what happened to it. The key makes queueing idempotent. */
export const mailOutbox = pgTable(
  'mail_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    text: text('text').notNull(),
    html: text('html').notNull(),
    /** For the List-Unsubscribe header (one click, RFC 8058). */
    unsubscribeUrl: text('unsubscribe_url'),
    status: text('status').$type<'queued' | 'sent' | 'failed'>().notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [index('mail_outbox_status_idx').on(table.status, table.createdAt)],
);

/**
 * Sign-in links for advertisers, who have no password: a link by mail to the address they gave
 * with their requests. Only the hash of the token is stored; a link works once, for 30 minutes.
 */
export const advertiserLogins = pgTable(
  'advertiser_logins',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('advertiser_logins_email_idx').on(table.email, table.createdAt)],
);

/** Signed-in advertisers, by e-mail address. The token lives in a cookie of its own. */
export const advertiserSessions = pgTable(
  'advertiser_sessions',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('advertiser_sessions_email_idx').on(table.email)],
);
