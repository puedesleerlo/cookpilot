# domain-model Specification

## Purpose
TBD - created by archiving change add-domain-model. Update Purpose after archive.
## Requirements
### Requirement: Single shared vocabulary

The system SHALL define every entity shared between packages — `Ingredient`, `Cook`,
`Equipment`, `Task`, `Dish`, `Dependency`, `SafetyConstraint`, `Constraints`, `MealPlan`,
`Schedule` and the schedule's constituent types — exactly once, in `packages/domain`.

No other package or application SHALL redeclare a structural type that already exists in
`packages/domain`.

#### Scenario: A type exists in exactly one place
- **WHEN** any module outside `packages/domain` needs the shape of a `Task`
- **THEN** it imports the type from `@kitchen/domain` rather than declaring its own

#### Scenario: The domain package depends on nothing
- **WHEN** a file in `packages/domain` imports from any other workspace package or application
- **THEN** `pnpm lint` fails with an error naming the forbidden import

#### Scenario: Every runtime shares the vocabulary
- **WHEN** the web client, the API and the worker each describe a `Task`
- **THEN** all three resolve the type to the same `@kitchen/domain` declaration

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

### Requirement: Scheduler output types live in the domain package

The system SHALL define the compiled-schedule types — `Schedule`, `ScheduledTask`,
`Lane`, `Rationale`, `DegradationEvent`, `ScheduleDiff` and `ScheduleMetrics` — in
`packages/domain` rather than in `packages/scheduler`.

This is what lets the web client render a compiled schedule, and the API persist and
broadcast one, without either of them depending on the engine's internals.

#### Scenario: A client can render without depending on engine internals
- **WHEN** a component in `apps/web` imports `Schedule` from `@kitchen/domain`
- **THEN** `pnpm lint` passes and no scheduler internal is pulled in

#### Scenario: The API can persist a schedule without importing the engine
- **WHEN** `apps/api` reads a stored schedule from the database
- **THEN** it validates it against the `@kitchen/domain` schema without importing `@kitchen/scheduler`

### Requirement: The scheduler package is structurally pure

Files in `packages/scheduler` SHALL NOT reference `Date.now`, `new Date()`,
`Math.random`, `fetch`, `crypto`, `performance`, `localStorage`, `indexedDB`, `process`, or
any Node built-in module. Current time SHALL be passed in as a parameter and randomness
SHALL come from a seeded generator.

The Node built-in ban is what keeps the package compilable for the browser, which the
offline demo path depends on.

#### Scenario: Ambient clock reads are a lint error
- **WHEN** a file in `packages/scheduler` calls `Date.now()`
- **THEN** `pnpm lint` fails with a message instructing the author to pass time as a parameter

#### Scenario: Ambient randomness is a lint error
- **WHEN** a file in `packages/scheduler` calls `Math.random()`
- **THEN** `pnpm lint` fails with a message pointing at the seeded generator

#### Scenario: Node built-ins are a lint error
- **WHEN** a file in `packages/scheduler` imports `node:fs` or `node:crypto`
- **THEN** `pnpm lint` fails, because the package must also run in a browser

### Requirement: The ingredient lexicon is a dictionary, not a parser

The system SHALL provide a canonical ingredient lexicon in `packages/domain` that maps a
**known term** to a canonical name, category, typical unit and default allergens.

Its permitted uses are: normalizing names that arrive from stage L1, autocomplete in the
structured intake form, and normalizing names in `RecipeIR`.

The system SHALL NOT use the lexicon, or any regular expression or keyword matcher, to
extract slots or ingredients from free-form speech or prose.

#### Scenario: Looking up a known term is a dictionary hit
- **WHEN** the lexicon is asked about "scallions"
- **THEN** it returns the canonical name "spring onions" with category aromatic

#### Scenario: An unknown term is preserved verbatim
- **WHEN** the lexicon is asked about "yu choy"
- **THEN** it returns the term unchanged, marked unrecognised, with a best-guess category

#### Scenario: No slot extractor exists
- **WHEN** the repository is scanned for a function that derives a time budget, a serving count or an ingredient list from free-form text without a model
- **THEN** none is found

### Requirement: The lexicon SHALL support search without becoming a parser
The lexicon MUST expose a search over canonical names and synonyms for autocomplete, and a
default urgency derived from `keepsDays`. Both are dictionary lookups over a whole query
term; neither may be used to segment a sentence into ingredients.

#### Scenario: Searching
- **WHEN** the lexicon is searched for a partial term
- **THEN** matching entries are returned, prefix matches first, capped to a usable number

#### Scenario: Default urgency from shelf life
- **WHEN** an entry keeps for two days or fewer
- **THEN** its default urgency is use-today

#### Scenario: No shelf life recorded
- **WHEN** an entry has no `keepsDays`
- **THEN** its default urgency is use-soon, never use-today

