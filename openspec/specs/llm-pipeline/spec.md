# llm-pipeline Specification

## Purpose
TBD - created by archiving change add-recipe-packs. Update Purpose after archive.
## Requirements
### Requirement: Every model call is validated at the boundary

The system SHALL route every model call through a single client that enforces a request
timeout, validates the response against a Zod schema, retries once with a repair prompt on
validation failure, and then falls back to a deterministic implementation.

The client SHALL NOT be reachable from `src/scheduler`.

#### Scenario: A malformed response is repaired
- **WHEN** the model returns JSON that fails schema validation
- **THEN** the client issues exactly one repair request quoting the validation error, and uses the repaired result if it validates

#### Scenario: A second failure falls back deterministically
- **WHEN** the repair attempt also fails validation
- **THEN** the stage returns its deterministic fallback result and records that the fallback was used

#### Scenario: A timeout falls back rather than hanging
- **WHEN** the model does not respond within the configured timeout
- **THEN** the request is aborted and the deterministic fallback is used

### Requirement: The application works with no API key

Where `VITE_ANTHROPIC_API_KEY` is unset, every stage SHALL use its deterministic fallback
and the application SHALL remain fully usable.

#### Scenario: No key means no call
- **WHEN** no API key is configured
- **THEN** no network request is attempted and each stage reports `source: 'fallback'`

#### Scenario: The demo compiles without a key
- **WHEN** the demo scenario is compiled with no API key
- **THEN** it produces a complete schedule from seed packs and deterministic stages

### Requirement: The model never makes a scheduling decision

LLM stages SHALL only extract, normalize, rank candidates and prettify prose. Task
ordering, resource allocation, cook assignment and degradation SHALL be computed by
`src/scheduler` alone.

#### Scenario: Stage output is data, not a schedule
- **WHEN** any LLM stage returns
- **THEN** its result contains no task start times, no resource assignments and no cook assignments

#### Scenario: The boundary is enforced by lint
- **WHEN** a file under `src/llm` imports from `@/scheduler`
- **THEN** `npm run lint` fails

### Requirement: Stage L3 normalizes recipe text into RecipeIR

Stage L3 SHALL accept pasted or fetched recipe text and return a validated `RecipeIR`.
Where the model is unavailable or its output cannot be repaired, the system SHALL fall back
to a deterministic parser driven by a cooking-verb rule table.

#### Scenario: Structured text becomes a schedulable recipe
- **WHEN** L3 is given a recipe with an ingredient list and numbered steps
- **THEN** it returns a `RecipeIR` whose steps carry durations, an active/passive split and equipment

#### Scenario: The deterministic parser handles the common shape
- **WHEN** the model is unavailable and the text has an ingredients block and one instruction per line
- **THEN** the fallback parser produces a valid `RecipeIR` using verb-keyed defaults for duration and equipment

#### Scenario: Unparseable text fails cleanly
- **WHEN** the text contains no recognisable ingredients or steps
- **THEN** the stage returns a failure naming what was missing, and no partial recipe is stored

### Requirement: Every prompt and response is inspectable

The system SHALL record each stage's prompt, raw response, validation outcome, retry count
and fallback usage in an in-application debug log that can be toggled on.

The log SHALL NOT record the API key.

#### Scenario: A stage run is inspectable after the fact
- **WHEN** a stage runs and the debug panel is opened
- **THEN** the entry shows the stage name, duration, whether a repair was needed and whether the fallback was used

#### Scenario: Secrets never reach the log
- **WHEN** the debug log is serialised
- **THEN** it contains no API key

