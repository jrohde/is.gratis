CREATE TABLE "offer_stats" (
	"offer_id" uuid NOT NULL,
	"day" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "offer_stats_offer_id_day_pk" PRIMARY KEY("offer_id","day")
);
--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD COLUMN "stats_token" text;--> statement-breakpoint
ALTER TABLE "offer_stats" ADD CONSTRAINT "offer_stats_offer_id_sponsored_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."sponsored_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_offers" ADD CONSTRAINT "sponsored_offers_stats_token_unique" UNIQUE("stats_token");