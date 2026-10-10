CREATE TABLE "bot_runs" (
	"task" text NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_runs_task_key_pk" PRIMARY KEY("task","key")
);
--> statement-breakpoint
CREATE INDEX "bot_runs_updated_idx" ON "bot_runs" USING btree ("updated_at");