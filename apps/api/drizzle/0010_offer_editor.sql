ALTER TABLE "sponsored_offers" ADD COLUMN "editor_decision" text;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "editor_notes" text;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "editor_suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "editor_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "editor_attempts" integer DEFAULT 0 NOT NULL;