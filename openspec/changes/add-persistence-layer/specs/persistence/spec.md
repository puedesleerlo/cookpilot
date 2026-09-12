## ADDED Requirements

### Requirement: Event sequence numbers are unique per session and assigned by the server

The system SHALL assign `session_events.seq` server-side, and the database SHALL enforce
uniqueness of `(session_id, seq)`.

A client SHALL NOT supply a sequence number.

This is what makes "the same inputs and the same ordered log produce the same schedule"
true rather than intended: two devices that disagreed about the order of the log would
compute different timelines from the same facts.

#### Scenario: Concurrent appends get distinct sequence numbers
- **WHEN** two events are appended to the same session concurrently
- **THEN** each receives a distinct `seq`, and both are stored

#### Scenario: A duplicate sequence number is rejected by the database
- **WHEN** an insert is attempted with a `(session_id, seq)` pair that already exists
- **THEN** the database rejects it with a unique-constraint violation

#### Scenario: Sequence numbers start at 1 and increase by 1
- **WHEN** three events are appended to a fresh session
- **THEN** their sequence numbers are 1, 2 and 3

#### Scenario: Sequences are per session, not global
- **WHEN** an event is appended to each of two different sessions
- **THEN** both receive `seq` 1

### Requirement: Every stored schedule records the log prefix it came from

`schedules.computed_from_seq` SHALL be non-null on every row, recording the highest event
sequence number included when that schedule was computed.

#### Scenario: A schedule is traceable to a point in the log
- **WHEN** a schedule is persisted after five events
- **THEN** its `computed_from_seq` is 5

#### Scenario: A schedule without a prefix is rejected
- **WHEN** an insert omits `computed_from_seq`
- **THEN** the database rejects it

#### Scenario: Staleness is detectable
- **WHEN** the current schedule's `computed_from_seq` is lower than the session's highest event sequence
- **THEN** the schedule is identifiable as stale without recomputing it

### Requirement: Join codes are unique and unambiguous

`sessions.join_code` SHALL be unique, six characters, and drawn from an alphabet excluding
characters that are easily confused when read aloud or typed.

#### Scenario: The alphabet excludes confusable characters
- **WHEN** a join code is generated
- **THEN** it contains no `0`, `O`, `1`, `I` or `L`

#### Scenario: Duplicate join codes are impossible
- **WHEN** two sessions are created with the same join code
- **THEN** the database rejects the second

#### Scenario: Codes are six characters
- **WHEN** any join code is generated
- **THEN** it is exactly six characters long

### Requirement: Migrations are a release step and roll back cleanly

Migrations SHALL be applied as an explicit release step, not by an instance during boot.

Each migration SHALL remain compatible with the previously deployed application version
for one deploy, so that rolling the application back does not strand the database.

#### Scenario: A booting instance does not migrate
- **WHEN** an API instance starts
- **THEN** it does not apply migrations, and an unmigrated database surfaces as a readiness failure rather than a race between instances

#### Scenario: Migrations are idempotent
- **WHEN** the migration runner is executed twice against the same database
- **THEN** the second run applies nothing and exits zero

#### Scenario: The previous application version still works
- **WHEN** a migration adds a column and the application is rolled back one version
- **THEN** the previous version continues to operate against the migrated schema

### Requirement: Recipes are stored for both text and vector search

The recipes table SHALL carry a `tsvector` column maintained from the recipe's name,
ingredients and techniques, and a pgvector embedding column.

#### Scenario: The vector extension is available
- **WHEN** the migrations have been applied
- **THEN** the `vector` extension is installed and the embedding column exists

#### Scenario: Full-text search has an index
- **WHEN** the schema is inspected
- **THEN** the `tsvector` column carries a GIN index

#### Scenario: The search vector is maintained, not hand-set
- **WHEN** a recipe row is inserted or updated
- **THEN** its search vector reflects the new content without a separate write

### Requirement: The database is a readiness dependency, not a liveness one

The API SHALL register a database check that `GET /readyz` reports, and `GET /healthz`
SHALL NOT depend on the database.

#### Scenario: A down database makes the instance unready
- **WHEN** Postgres is unreachable
- **THEN** `GET /readyz` returns 503 naming the database, and `GET /healthz` still returns 200

#### Scenario: The readiness check is cheap
- **WHEN** the database check runs
- **THEN** it issues a single trivial query and reports its latency

### Requirement: One command reaches a working local environment

The repository SHALL provide a Compose file bringing up Postgres and Redis, and a seed
command loading the bundled recipe packs and the demo scenario.

#### Scenario: Seeding is idempotent
- **WHEN** the seed command is run twice
- **THEN** the second run leaves the database in the same state as the first, without duplicate packs

#### Scenario: Seeding loads the corpus
- **WHEN** the seed command completes
- **THEN** every bundled seed pack and all of its recipes are present in the database

#### Scenario: The demo session is reachable after seeding
- **WHEN** the seed command completes
- **THEN** the demo scenario's pantry and constraints are available as a session that can be compiled
