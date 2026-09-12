import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The schema.
 *
 * Two constraints here are load-bearing rather than tidy, and both are in the database
 * because the application cannot be trusted to hold them under concurrency:
 *
 *   1. `(session_id, seq)` is unique. The sync model says any device with the same inputs
 *      and the same ordered log computes the same timeline. If two writers could ever take
 *      the same sequence number, the log would not have one order, and that sentence would
 *      stop being true in a way nobody would notice until two phones disagreed.
 *
 *   2. `computed_from_seq` is NOT NULL on every schedule. Without it there is no way to
 *      tell a stale schedule from a current one, and no way to answer "why does my
 *      timeline differ from yours".
 */

// -------------------------------------------------------------------- devices

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  /** Hash of the anonymous token, never the token. A database dump must not be a key ring. */
  anonTokenHash: text('anon_token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------------------- sessions

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    /** Six characters, unambiguous alphabet. Unique so two sessions can never collide. */
    joinCode: text('join_code').notNull(),
    hostDeviceId: text('host_device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('open'),
    /** Pantry and constraints. Synced; the schedule is derived and never synced. */
    inputs: jsonb('inputs').notNull(),
    /** Which engine build the last compile used, so a divergence can be attributed. */
    schedulerVersion: text('scheduler_version').notNull(),
    /** The crew as compiled — ids, names, skills. A device joining claims one of these. */
    crew: jsonb('crew').notNull().default([]),
    /**
     * Content hash of the schedule the host compiled from `inputs`. Not the schedule: a
     * device that joins compiles its own and compares, so "we agree byte for byte" is a
     * check that runs rather than a sentence in a document.
     */
    scheduleHash: text('schedule_hash').notNull().default(''),
    /** Server clock when the host started cooking. Every countdown is anchored to it. */
    startedAt: timestamp('started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('sessions_join_code_key').on(t.joinCode),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const sessionMembers = pgTable(
  'session_members',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /** Which cook in the compiled plan this device is. */
    cookId: text('cook_id').notNull(),
    displayName: text('display_name').notNull(),
    skill: text('skill').notNull().default('intermediate'),
    connected: boolean('connected').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.deviceId] }),
    index('session_members_session_idx').on(t.sessionId),
  ],
);

// ------------------------------------------------------------- the event log

export const sessionEvents = pgTable(
  'session_events',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** Assigned server-side, inside the transaction. Never supplied by a client. */
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    taskId: text('task_id'),
    payload: jsonb('payload').notNull().default({}),
    byDeviceId: text('by_device_id').references(() => devices.id, { onDelete: 'set null' }),
    serverTs: timestamp('server_ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The invariant the whole sync model rests on.
    uniqueIndex('session_events_session_seq_key').on(t.sessionId, t.seq),
    // Replay-since-seq is the hot path on every reconnect.
    index('session_events_replay_idx').on(t.sessionId, t.seq),
  ],
);

// ------------------------------------------------------------------ schedules

export const schedules = pgTable(
  'schedules',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** Which prefix of the log produced this. Not null, always. */
    computedFromSeq: integer('computed_from_seq').notNull(),
    schedule: jsonb('schedule').notNull(),
    rationale: jsonb('rationale').notNull().default([]),
    makespanMin: integer('makespan_min').notNull(),
    schedulerVersion: text('scheduler_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('schedules_session_idx').on(t.sessionId, t.computedFromSeq),
    // One schedule per (session, log prefix): recomputing the same prefix is idempotent.
    uniqueIndex('schedules_session_prefix_key').on(t.sessionId, t.computedFromSeq),
  ],
);

// ------------------------------------------------------------- recipe corpus

export const recipePacks = pgTable(
  'recipe_packs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    /** Identity. Two packs with the same recipes are the same pack. */
    contentHash: text('content_hash').notNull(),
    provenance: text('provenance').notNull(),
    visibility: text('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('recipe_packs_content_hash_key').on(t.contentHash)],
);

export const recipes = pgTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    packId: text('pack_id')
      .notNull()
      .references(() => recipePacks.id, { onDelete: 'cascade' }),
    /** The structured representation. Never source prose. */
    ir: jsonb('ir').notNull(),
    canonicalName: text('canonical_name').notNull(),
    kind: text('kind').notNull(),
    /**
     * Maintained by a trigger rather than by the application: a search vector the
     * application forgets to update is a recipe that silently stops being findable.
     */
    searchVector: text('search_vector'),
    /** gemini-embedding-001 output, for "something warm and soupy" queries. */
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipes_pack_idx').on(t.packId),
    index('recipes_kind_idx').on(t.kind),
  ],
);

// ------------------------------------------------------------------ ingestion

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: text('id').primaryKey(),
    sourceUrl: text('source_url').notNull(),
    status: text('status').notNull().default('queued'),
    /**
     * Which path produced the result. If the `llm` share is high, the structured-markup
     * extractor is weak — that is a fact about our code, not about the web.
     */
    method: text('method'),
    resultRecipeId: text('result_recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ingestion_jobs_status_idx').on(t.status),
    uniqueIndex('ingestion_jobs_source_url_key').on(t.sourceUrl),
  ],
);

// ------------------------------------------------------------------ llm cache

export const llmCache = pgTable(
  'llm_cache',
  {
    /** Content hash of the stage input. Identical input costs nothing the second time. */
    inputHash: text('input_hash').primaryKey(),
    stage: text('stage').notNull(),
    model: text('model').notNull(),
    response: jsonb('response').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('llm_cache_stage_idx').on(t.stage)],
);

// --------------------------------------------------------------- voice usage

export const voiceUsage = pgTable(
  'voice_usage',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    units: numeric('units').notNull(),
    cost: numeric('cost').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('voice_usage_session_idx').on(t.sessionId)],
);

/**
 * Raw SQL the generated migrations cannot express: the vector extension, the tsvector
 * column with its trigger, and the GIN index over it.
 *
 * The search vector is maintained by a trigger on purpose. An application that has to
 * remember to update it will forget, and the symptom — a recipe that exists but cannot be
 * found — is close to undiagnosable from the outside.
 */
export const RAW_MIGRATION_SQL = [
  `CREATE EXTENSION IF NOT EXISTS vector;`,

  `ALTER TABLE recipes DROP COLUMN IF EXISTS search_vector;`,
  `ALTER TABLE recipes ADD COLUMN search_vector tsvector;`,

  `CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
   BEGIN
     NEW.search_vector :=
       setweight(to_tsvector('english', coalesce(NEW.ir->>'title', '')), 'A') ||
       setweight(to_tsvector('english', coalesce(
         (SELECT string_agg(value->>'canonicalName', ' ')
          FROM jsonb_array_elements(coalesce(NEW.ir->'ingredients', '[]'::jsonb))), '')), 'B') ||
       setweight(to_tsvector('english', coalesce(
         (SELECT string_agg(value->>'verb', ' ')
          FROM jsonb_array_elements(coalesce(NEW.ir->'steps', '[]'::jsonb))), '')), 'C') ||
       setweight(to_tsvector('english', coalesce(
         (SELECT string_agg(value #>> '{}', ' ')
          FROM jsonb_array_elements(coalesce(NEW.ir->'tags', '[]'::jsonb))), '')), 'C');
     RETURN NEW;
   END
   $$ LANGUAGE plpgsql;`,

  `DROP TRIGGER IF EXISTS recipes_search_vector_trigger ON recipes;`,
  `CREATE TRIGGER recipes_search_vector_trigger
     BEFORE INSERT OR UPDATE OF ir ON recipes
     FOR EACH ROW EXECUTE FUNCTION recipes_search_vector_update();`,

  `CREATE INDEX IF NOT EXISTS recipes_search_vector_idx ON recipes USING GIN (search_vector);`,

  // IVFFlat needs rows before it is worth building; cosine matches how embeddings compare.
  `CREATE INDEX IF NOT EXISTS recipes_embedding_idx ON recipes
     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`,
] as const;

export const ping = sql`SELECT 1`;
