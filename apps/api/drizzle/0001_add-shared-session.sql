ALTER TABLE "sessions" ADD COLUMN "crew" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "schedule_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "started_at" timestamp with time zone;