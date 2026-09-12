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

### Requirement: The application works with no model provider reachable

Where the model provider is unreachable, unconfigured or disabled, the system SHALL remain
fully usable: the structured intake form, bundled seed packs, deterministic ranking,
template explanations and the scheduler SHALL between them reach a compiled schedule.

The demo scenario SHALL compile end to end with the API origin blocked.

This requirement does not rest on a natural-language fallback parser. The fallback for
stage L1 is the structured form, which needs no parsing.

#### Scenario: No provider means no call
- **WHEN** the model provider is disabled
- **THEN** no request is attempted and each stage reports that it took its deterministic primary path or was skipped

#### Scenario: The demo compiles with the API blocked
- **WHEN** the demo scenario is started with the API origin unreachable
- **THEN** a complete schedule is produced in the browser from bundled seed packs

#### Scenario: Form and voice produce the same constraints
- **WHEN** equivalent answers are given through the structured form and through the voice interview
- **THEN** the resulting `Constraints` objects are identical

### Requirement: The model provider contributes no secret

The system SHALL authenticate to the model provider through workload identity — the
service account's Application Default Credentials — and SHALL NOT read, store or transmit
a model API key.

#### Scenario: No model key is configured anywhere
- **WHEN** the repository and the deployment configuration are scanned for a model provider API key
- **THEN** none is found, and no module reads one

#### Scenario: The client bundle carries no provider secret
- **WHEN** the built client bundle is scanned
- **THEN** it contains no provider secret name and no value matching a known key shape

