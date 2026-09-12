## Why

Sessions, the ordered event log and the recipe corpus all need somewhere to live, and two
of the system's guarantees are database guarantees rather than application ones.

The first: `session_events.seq` is unique per session and assigned server-side. If two
devices could ever be handed the same sequence number, the fold over the log would differ
between them, and "same inputs and same log means same schedule" — the property the whole
sync model rests on — would quietly stop being true. A unique constraint is what makes
that a fact rather than an intention.

The second: `schedules.computedFromSeq` records which prefix of the log produced a
schedule. Without it there is no way to tell a stale schedule from a current one, and no
way to answer "why does my timeline differ from yours".

## What Changes

- Add Postgres with Drizzle: schema, generated migrations, and a migration runner that is
  a release step rather than something a booting instance races other instances to run.
- Add the ten tables from the architecture: devices, sessions, session members, the event
  log, schedules, recipe packs, recipes, ingestion jobs, the LLM cache and voice usage.
- Enforce the two invariants in the database: `(session_id, seq)` unique, and
  `computed_from_seq` not null on every stored schedule.
- Append events through a function that assigns `seq` **inside the transaction**, so two
  concurrent writers cannot both take the same number.
- Add pgvector and a `tsvector` column on recipes, so internal search has somewhere to go
  in `add-internal-recipe-search`.
- Add a repository layer with typed queries, and register a Postgres readiness check with
  the API so `/readyz` reflects the database.
- Add a seed script loading the seed packs and the demo scenario, so one command gets a
  developer to a working environment.
- Keep migrations backward-compatible for one deploy, so a rollback does not strand the
  database.

## Capabilities

### New Capabilities
- `persistence`: the schema, its invariants, how migrations are applied and rolled back,
  the repository surface, and what the seed produces.

## Impact

- Creates `apps/api/src/db/`, `apps/api/drizzle/`, `docker-compose.yml`, a seed script.
- Adds a Postgres dependency to `apps/api` and `apps/worker`.
- `/readyz` gains a database check, so a broken database stops an instance taking traffic.
