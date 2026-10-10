CREATE TABLE "invoice_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"token" text NOT NULL,
	"offer_id" uuid,
	"lang" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_address" text,
	"customer_country" text,
	"customer_vat_number" text,
	"lines" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"vat_note" text,
	"vat_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_via" text,
	"mollie_payment_id" text,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "billing_country" text;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "awaiting_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "renewal_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_offer_id_sponsored_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."sponsored_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "invoices_offer_idx" ON "invoices" USING btree ("offer_id");