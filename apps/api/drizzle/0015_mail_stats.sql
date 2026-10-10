ALTER TABLE "offer_stats" ADD COLUMN "mail_sends" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_stats" ADD COLUMN "mail_clicks" integer DEFAULT 0 NOT NULL;