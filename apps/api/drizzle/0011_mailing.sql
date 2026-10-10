CREATE TABLE "mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text NOT NULL,
	"unsubscribe_url" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "mail_outbox_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"list" text NOT NULL,
	"lang" text NOT NULL,
	"region" text,
	"token" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "in_mailing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "mailing_price_cents" integer;--> statement-breakpoint
CREATE INDEX "mail_outbox_status_idx" ON "mail_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_confirmed_idx" ON "subscriptions" USING btree ("email","list") WHERE confirmed_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_waiting_idx" ON "subscriptions" USING btree ("email","list") WHERE confirmed_at is null;--> statement-breakpoint
CREATE INDEX "subscriptions_list_idx" ON "subscriptions" USING btree ("list","lang");