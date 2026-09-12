## 1. Schema

- [x] 1.1 Add `apps/api/src/db/schema.ts` with the ten tables from the architecture.
- [x] 1.2 Enforce `(session_id, seq)` unique and `computed_from_seq` NOT NULL in the database.
- [x] 1.3 Add the pgvector column, the `tsvector` column, its maintaining trigger and its GIN index as raw SQL the generator cannot express.
- [x] 1.4 Hash the device token rather than storing it, so a dump is not a key ring.

## 2. Migrations

- [x] 2.1 Add `drizzle.config.ts`; generate `drizzle/0000_init.sql`.
- [x] 2.2 Add `src/db/migrate.ts` as an explicit release step, never run by a booting instance.
- [x] 2.3 Verify against a real Postgres: tables, indexes, trigger, and a clean second run.

## 3. Repositories

- [x] 3.1 Add `src/db/sessions.ts`: `appendEvent` assigning `seq` under a row lock inside the transaction.
- [x] 3.2 Add replay-since-seq, highest-seq, and staleness detection from `computed_from_seq`.
- [x] 3.3 Add schedule persistence that treats recomputing the same prefix as idempotent.
- [x] 3.4 Add membership upsert and presence updates.
- [x] 3.5 Add join-code generation over an unambiguous alphabet.

## 4. Wiring

- [x] 4.1 Add `src/db/client.ts` with a small per-instance pool and a readiness check.
- [x] 4.2 Register the database check with the API so `/readyz` reflects it and `/healthz` does not.
- [x] 4.3 Close the pool on shutdown.

## 5. Local environment and seed

- [x] 5.1 Add `docker-compose.yml` bringing up Postgres with pgvector and Redis.
- [x] 5.2 Add `src/db/seed.ts`, idempotent by pack content hash.
- [x] 5.3 Add `migrate`, `migrate:generate` and `seed` scripts.

## 6. Tests

- [x] 6.1 Integration tests against a real Postgres, skipping cleanly when none is configured.
- [x] 6.2 Prove the concurrency guarantee: twelve simultaneous appends get twelve distinct sequence numbers.
- [x] 6.3 Prove the guarantee is real by removing the row lock and observing the unique-constraint violation.
- [x] 6.4 Prove `computed_from_seq` is mandatory, staleness is detectable, and re-persisting a prefix is idempotent.
- [x] 6.5 Prove the search vector is maintained by the database on insert and on update.
- [x] 6.6 Prove seeding loads 5 packs and 22 recipes, and that a second run changes nothing.

## 7. Close out

- [x] 7.1 `pnpm check` clean; the API boots and `/readyz` reports Postgres.
- [x] 7.2 `openspec validate add-persistence-layer --strict` clean.
- [x] 7.3 Log decisions; archive; commit.
