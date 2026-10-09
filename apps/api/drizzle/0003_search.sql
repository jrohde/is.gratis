CREATE TABLE "related_subjects" (
	"lang" text NOT NULL,
	"query" text NOT NULL,
	"subjects" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "related_subjects_lang_query_pk" PRIMARY KEY("lang","query")
);
--> statement-breakpoint
CREATE TABLE "search_misses" (
	"lang" text NOT NULL,
	"query" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_misses_lang_query_day_pk" PRIMARY KEY("lang","query","day")
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "search_doc" "tsvector";--> statement-breakpoint
CREATE INDEX "related_subjects_created_idx" ON "related_subjects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pages_search_idx" ON "pages" USING gin ("search_doc");--> statement-breakpoint
-- Hand-written below: the search document is computed by Postgres itself, so every way a page
-- changes (edits, reverts, seeds, drafts) keeps it up to date.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION isgratis_ts_config(lang text) RETURNS regconfig
LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE lang WHEN 'nl' THEN 'dutch' WHEN 'en' THEN 'english' WHEN 'de' THEN 'german' WHEN 'es' THEN 'spanish' ELSE 'simple' END)::regconfig
$$;
--> statement-breakpoint
-- Markdown to plain words: list markers, citations, wiki links, links and emphasis removed.
CREATE OR REPLACE FUNCTION isgratis_plain(markdown text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(markdown, ''),
    '(^|\n)\s*[-*]\s+', '\1', 'g'),
    '\[\^[a-z0-9-]+\]', '', 'g'),
    '\[\[([^\]|]+)\|([^\]]+)\]\]', '\2', 'g'),
    '\[\[([^\]]+)\]\]', '\1', 'g'),
    '\[([^\]]+)\]\([^)]*\)|[*_`>#]', '\1', 'g')
$$;
--> statement-breakpoint
-- Title weighs most (also unstemmed, so exact words rank first), then the short answer, then the
-- body, then facts, trivia and regional texts.
CREATE OR REPLACE FUNCTION isgratis_search_doc(lang text, title text, content jsonb) RETURNS tsvector
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    setweight(to_tsvector(isgratis_ts_config(lang), coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector(isgratis_ts_config(lang), isgratis_plain(content->>'summary')), 'B') ||
    setweight(to_tsvector(isgratis_ts_config(lang), isgratis_plain(concat_ws(' ', content->>'whenFree', content->>'whenNotFree', content->>'background'))), 'C') ||
    setweight(to_tsvector(isgratis_ts_config(lang), isgratis_plain(concat_ws(' ',
      (SELECT string_agg(t, ' ') FROM jsonb_array_elements_text(coalesce(content->'trivia', '[]'::jsonb)) t),
      (SELECT string_agg(concat_ws(' ', f->>'label', f->>'value'), ' ') FROM jsonb_array_elements(coalesce(content->'facts', '[]'::jsonb)) f),
      (SELECT string_agg(b->>'text', ' ') FROM jsonb_array_elements(coalesce(content->'regions', '[]'::jsonb)) b)
    ))), 'D')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION isgratis_pages_search() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT isgratis_search_doc(NEW.lang, NEW.title, r.content) INTO NEW.search_doc
  FROM revisions r WHERE r.id = NEW.current_revision_id;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pages_search_doc BEFORE INSERT OR UPDATE OF current_revision_id, title ON pages
FOR EACH ROW EXECUTE FUNCTION isgratis_pages_search();
--> statement-breakpoint
UPDATE pages SET search_doc = (
  SELECT isgratis_search_doc(pages.lang, pages.title, r.content) FROM revisions r WHERE r.id = pages.current_revision_id
);
--> statement-breakpoint
-- "Did you mean": titles that look like what was typed.
CREATE INDEX pages_title_trgm_idx ON pages USING gin (lower(title) gin_trgm_ops);
