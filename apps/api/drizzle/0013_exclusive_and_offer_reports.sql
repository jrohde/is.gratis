ALTER TABLE "reports" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "exclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_offer_id_sponsored_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."sponsored_offers"("id") ON DELETE cascade ON UPDATE no action;