## MODIFIED Requirements

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

### Requirement: Scheduler output types live in the domain package

The system SHALL define the compiled-schedule types — `Schedule`, `ScheduledTask`,
`Lane`, `Rationale`, `DegradationEvent`, `ScheduleDiff` and `ScheduleMetrics` — in
`packages/domain` rather than in `packages/scheduler`.

This is what lets the web client render a compiled schedule, and the API persist and
broadcast one, without either of them depending on the engine's internals.

#### Scenario: A client can render without depending on engine internals
- **WHEN** a component in `apps/web` imports `Schedule` from `@kitchen/domain`
- **THEN** `pnpm lint` passes and no scheduler internal is pulled in

#### Scenario: The API can persist a schedule it did not compute in-process
- **WHEN** `apps/api` reads a stored schedule from the database
- **THEN** it validates it against the `@kitchen/domain` schema without importing the engine

### Requirement: The scheduler package is structurally pure

Files in `packages/scheduler` SHALL NOT reference `Date.now`, `new Date()`,
`Math.random`, `fetch`, `crypto`, `performance`, `localStorage`, `indexedDB` or any Node
built-in module. Current time SHALL be passed in as a parameter and randomness SHALL come
from a seeded generator.

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

## ADDED Requirements

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
