CREATE TABLE "advertiser_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertiser_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "advertiser_logins_email_idx" ON "advertiser_logins" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "advertiser_sessions_email_idx" ON "advertiser_sessions" USING btree ("email");