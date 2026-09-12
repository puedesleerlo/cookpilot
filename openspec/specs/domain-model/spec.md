# domain-model Specification

## Purpose
TBD - created by archiving change add-domain-model. Update Purpose after archive.
## Requirements
### Requirement: Single shared vocabulary

The system SHALL define every entity shared between layers — `Ingredient`, `Cook`,
`Equipment`, `Task`, `Dish`, `Dependency`, `SafetyConstraint`, `Constraints`, `MealPlan`,
`Schedule` and the schedule's constituent types — exactly once, in `src/domain/`.

No other layer SHALL redeclare a structural type that already exists in `src/domain/`.

#### Scenario: A type exists in exactly one place
- **WHEN** any module outside `src/domain/` needs the shape of a `Task`
- **THEN** it imports the type from `@/domain` rather than declaring its own

#### Scenario: The domain layer depends on nothing
- **WHEN** a file in `src/domain/` imports from `@/scheduler`, `@/llm`, `@/ui`, `@/recipes` or `@/app`
- **THEN** `npm run lint` fails with an error naming the forbidden import

### Requirement: Schemas and types cannot drift

Every exported domain entity SHALL have a Zod schema named `<Entity>Schema`, and the
exported TypeScript type SHALL be derived from that schema via `z.infer`. Hand-written
type declarations that duplicate a schema are prohibited.

#### Scenario: Type is derived, not duplicated
- **WHEN** a field is added to `TaskSchema`
- **THEN** the `Task` type gains that field with no separate edit, because `Task` is `z.infer<typeof TaskSchema>`

#### Scenario: Invalid data is rejected at the boundary
- **WHEN** `TaskSchema.safeParse` is given an object whose `durationMin` is negative
- **THEN** the result is `success: false` and the issue path names `durationMin`

#### Scenario: Every exported schema round-trips its own fixture
- **WHEN** the test suite parses each fixture factory's output with its corresponding schema
- **THEN** every parse succeeds

### Requirement: Tasks separate equipment occupancy from cook occupancy

A `Task` SHALL carry a `phase` of `start`, `hold` or `finish` and a boolean
`requiresCook`. A task in the `hold` phase SHALL have `requiresCook` set to `false`,
representing time in which equipment is occupied but no cook is.

This is the structural basis for parallelism: without it, twenty-four minutes of rice
cooking would consume a cook.

#### Scenario: A hold phase does not consume a cook
- **WHEN** a `Task` is constructed with `phase: 'hold'`
- **THEN** schema validation fails unless `requiresCook` is `false`

#### Scenario: Active phases require a cook
- **WHEN** a `Task` is constructed with `phase: 'start'` or `phase: 'finish'` and `requiresCook: false`
- **THEN** schema validation fails

### Requirement: Dependencies express both minimum and maximum delay

A `Dependency` SHALL support an optional `minDelayMin` (a task may not begin until N
minutes after its predecessor finishes) and an optional `maxDelayMin` (a task MUST begin
within N minutes of its predecessor finishing). Where both are present, `minDelayMin`
SHALL be less than or equal to `maxDelayMin`.

`maxDelayMin` is what makes food safety and food quality schedulable: cooked food must
reach refrigeration within 120 minutes, and a seared fillet must be served within 10.

#### Scenario: Resting time is expressible
- **WHEN** a dependency declares `minDelayMin: 3`
- **THEN** the schema accepts it and downstream consumers may not start the task earlier than 3 minutes after the predecessor finishes

#### Scenario: Contradictory delays are rejected
- **WHEN** a dependency declares `minDelayMin: 10` and `maxDelayMin: 5`
- **THEN** schema validation fails

### Requirement: Equipment carries capacity and contamination state

An `Equipment` entry SHALL declare a `count` of interchangeable instances and a
`contaminationState` drawn from `clean`, `soiled`, `raw-meat`, `raw-fish`, `raw-egg`, or
an allergen-qualified state of the form `allergen:<id>`.

Cold storage SHALL be modelled as equipment with finite capacity rather than as an
unlimited resource.

#### Scenario: Equipment instances are countable
- **WHEN** a kitchen declares two burners
- **THEN** it is represented as a single `Equipment` entry of kind `burner` with `count: 2`

#### Scenario: Allergen contamination state is accepted
- **WHEN** equipment declares `contaminationState: 'allergen:peanut'`
- **THEN** schema validation succeeds and the allergen id is recoverable from the value

#### Scenario: Unknown contamination states are rejected
- **WHEN** equipment declares `contaminationState: 'sticky'`
- **THEN** schema validation fails

### Requirement: Cook capability is expressed as task-class eligibility

A `Cook` SHALL carry a `skill` of `beginner`, `intermediate` or `confident`, an explicit
list of eligible `TaskClass` values, and the time windows in which they are available.

Eligibility SHALL be independent of skill so that a confident adult can still be excluded
from a task class, and an eleven-year-old can be permitted to wash, mix, portion and
label while being excluded from raw protein and hot surfaces.

#### Scenario: Eligibility narrows what skill would allow
- **WHEN** a cook has `skill: 'confident'` but `eligibleFor` omits `raw-protein`
- **THEN** that cook is not eligible for a task of class `raw-protein`

#### Scenario: Availability is a set of windows
- **WHEN** a cook is available from minute 0 to minute 18 only
- **THEN** their `available` array holds a single `TimeWindow` of `{ startMin: 0, endMin: 18 }`

### Requirement: Scheduler output types live in the domain layer

The system SHALL define the compiled-schedule types — `Schedule`, `ScheduledTask`,
`Lane`, `Rationale`, `DegradationEvent`, `ScheduleDiff` and `ScheduleMetrics` — in
`src/domain/` rather than in `src/scheduler/`.

This is what allows `src/ui` to render a compiled schedule while remaining lint-forbidden
from importing the engine that computes one.

#### Scenario: The UI can render without being able to compute
- **WHEN** a component in `src/ui/` imports `Schedule` from `@/domain`
- **THEN** `npm run lint` passes

#### Scenario: The UI cannot reach the engine
- **WHEN** a component in `src/ui/` imports anything from `@/scheduler` or `@/llm`
- **THEN** `npm run lint` fails with an error directing the author to `@/app`

### Requirement: The scheduler layer is structurally pure

Files under `src/scheduler/` SHALL NOT reference `Date.now`, `new Date()`, `Math.random`,
`fetch`, `crypto`, `performance`, `localStorage` or `indexedDB`. Current time SHALL be
passed in as a parameter and randomness SHALL come from a seeded generator.

#### Scenario: Ambient clock reads are a lint error
- **WHEN** a file in `src/scheduler/` calls `Date.now()`
- **THEN** `npm run lint` fails with a message instructing the author to pass time as a parameter

#### Scenario: Ambient randomness is a lint error
- **WHEN** a file in `src/scheduler/` calls `Math.random()`
- **THEN** `npm run lint` fails with a message pointing at the seeded generator

### Requirement: Identity is deterministic and human-readable

Entity ids SHALL be constructed from stable, meaningful components by a shared id builder
(for example `task:salmon:sear:start`) and SHALL NOT be drawn from a random or
time-based source.

Scheduling tie-breaks resolve on task id; a random id would make the scheduler
non-deterministic through the back door.

#### Scenario: The same inputs produce the same id
- **WHEN** the id builder is called twice with the same components
- **THEN** both calls return the identical string

#### Scenario: Components are slugified
- **WHEN** the id builder is given the component `Bok Choy & Garlic`
- **THEN** the resulting segment is lowercase, hyphen-separated, and free of characters that would break a URL fragment

### Requirement: Fixture factories back every later test

The system SHALL provide fixture factories in `src/test/` producing valid `Ingredient`,
`Cook`, `Equipment`, `Task`, `Dish` and `Constraints` values, each accepting a partial
override object.

#### Scenario: A fixture is valid by default
- **WHEN** a factory is called with no arguments
- **THEN** the returned value parses cleanly against its schema

#### Scenario: A fixture accepts overrides
- **WHEN** a factory is called with `{ durationMin: 12 }`
- **THEN** the returned value has `durationMin` of 12 and remains schema-valid

### Requirement: The shared vocabulary includes the recipe representation

The domain layer SHALL define `RecipeIR`, `RecipeStep` and `RecipePack` alongside the
existing entities, so that `src/recipes`, `src/llm` and the task-graph compiler all agree
on the shape of a recipe without any of them importing another.

#### Scenario: Recipe types come from the domain layer
- **WHEN** `src/llm` produces a `RecipeIR` and `src/recipes` validates one
- **THEN** both import the type and its schema from `@/domain`

#### Scenario: A recipe step's phase budget is enforced by schema
- **WHEN** a `RecipeStep` is constructed whose active and finishing minutes exceed its duration
- **THEN** schema validation fails and names the offending field

