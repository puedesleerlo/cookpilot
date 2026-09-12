CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"anon_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"method" text,
	"result_recipe_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"input_hash" text PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"model" text NOT NULL,
	"response" jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"content_hash" text NOT NULL,
	"provenance" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"ir" jsonb NOT NULL,
	"canonical_name" text NOT NULL,
	"kind" text NOT NULL,
	"search_vector" text,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"computed_from_seq" integer NOT NULL,
	"schedule" jsonb NOT NULL,
	"rationale" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"makespan_min" integer NOT NULL,
	"scheduler_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"task_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_device_id" text,
	"server_ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_members" (
	"session_id" text NOT NULL,
	"device_id" text NOT NULL,
	"cook_id" text NOT NULL,
	"display_name" text NOT NULL,
	"skill" text DEFAULT 'intermediate' NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_members_session_id_device_id_pk" PRIMARY KEY("session_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"join_code" text NOT NULL,
	"host_device_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"inputs" jsonb NOT NULL,
	"scheduler_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"kind" text NOT NULL,
	"units" numeric NOT NULL,
	"cost" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_result_recipe_id_recipes_id_fk" FOREIGN KEY ("result_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_pack_id_recipe_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."recipe_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_by_device_id_devices_id_fk" FOREIGN KEY ("by_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_device_id_devices_id_fk" FOREIGN KEY ("host_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_usage" ADD CONSTRAINT "voice_usage_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_jobs_source_url_key" ON "ingestion_jobs" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "llm_cache_stage_idx" ON "llm_cache" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_packs_content_hash_key" ON "recipe_packs" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "recipes_pack_idx" ON "recipes" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "recipes_kind_idx" ON "recipes" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "schedules_session_idx" ON "schedules" USING btree ("session_id","computed_from_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_session_prefix_key" ON "schedules" USING btree ("session_id","computed_from_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_seq_key" ON "session_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "session_events_replay_idx" ON "session_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "session_members_session_idx" ON "session_members" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_join_code_key" ON "sessions" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "voice_usage_session_idx" ON "voice_usage" USING btree ("session_id");