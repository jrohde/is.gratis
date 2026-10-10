CREATE TABLE "editor_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"notes" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editor_reviews" ADD CONSTRAINT "editor_reviews_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_reviews" ADD CONSTRAINT "editor_reviews_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editor_reviews_revision_idx" ON "editor_reviews" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "editor_reviews_created_idx" ON "editor_reviews" USING btree ("created_at");