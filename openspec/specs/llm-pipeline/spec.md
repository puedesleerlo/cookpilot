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

The system SHALL authenticate to Vertex AI through workload identity — the Cloud Run
service account's Application Default Credentials — and SHALL NOT read, store, log or
transmit a model API key.

The Vertex client SHALL be constructed from a project id and a location only.

#### Scenario: No model key is configured anywhere
- **WHEN** the repository and the deployment configuration are scanned for a model provider API key
- **THEN** none is found, and no module reads one

#### Scenario: The client bundle carries no provider secret
- **WHEN** the built client bundle is scanned
- **THEN** it contains no provider secret name and no value matching a known key shape

#### Scenario: The Vertex client takes no credential
- **WHEN** the Vertex client is constructed
- **THEN** it is given a project and a location, and no credential value

#### Scenario: The secret inventory has no model entry
- **WHEN** the secret inventory is filtered for the model provider
- **THEN** it is empty

### Requirement: Every model string lives in one config module

The system SHALL declare every model identifier in a single configuration module, one per
stage, each overridable by an environment variable.

No model identifier SHALL appear anywhere else in the codebase.

#### Scenario: Replacing a deprecated model is a config change
- **WHEN** a model is deprecated
- **THEN** it is replaced by editing the config module or setting an environment variable, with no other source change

#### Scenario: No stray model strings
- **WHEN** the repository is scanned for strings matching a model identifier pattern
- **THEN** every match is inside the config module or its tests

#### Scenario: Each stage is independently overridable
- **WHEN** `MODEL_L3_NORMALIZE` is set
- **THEN** stage L3 uses that model and every other stage is unaffected

### Requirement: No retired model generation is referenced

The system SHALL NOT reference any Gemini 2.5 model identifier.

Those models shut down in October 2026; one in this codebase is a scheduled outage rather
than a style problem.

#### Scenario: A 2.5 model string fails the build
- **WHEN** any source file contains `gemini-2.5-`
- **THEN** the model configuration test fails naming the file

#### Scenario: Configured models are from a supported generation
- **WHEN** the configured model for each stage is inspected
- **THEN** every one is from a generation the provider still serves

### Requirement: Output is constrained at generation and validated after it

Each stage SHALL pass a `responseSchema` generated from its own Zod schema, and SHALL
validate the response against that same Zod schema before returning it.

#### Scenario: The constraint and the validation come from one definition
- **WHEN** a stage's Zod schema changes
- **THEN** both the generation constraint and the validation change together, with no second edit

#### Scenario: Schema-shaped but semantically wrong output is still caught
- **WHEN** the model returns JSON matching the shape but failing a refinement, such as a step whose active minutes exceed its duration
- **THEN** validation rejects it and the stage takes its repair or fallback path

#### Scenario: A stage result is never returned unvalidated
- **WHEN** any stage returns
- **THEN** its value has passed the stage's Zod schema

### Requirement: Identical input costs nothing twice

The system SHALL cache stage responses by a content hash of the stage input, and SHALL
return a cached response without calling the provider.

The cache SHALL NOT store pantry contents or voice transcripts as readable text.

#### Scenario: A repeated call is free
- **WHEN** a stage is called twice with identical input
- **THEN** the second call returns the stored response and no provider request is made

#### Scenario: Different input is not confused for the same input
- **WHEN** two stage inputs differ by one ingredient
- **THEN** they hash differently and the second is not served the first's response

#### Scenario: The cache key does not reveal its input
- **WHEN** the cache table is read
- **THEN** the key is a hash and no row contains a readable pantry or transcript

### Requirement: Demo mode serves recorded fixtures

Where demo mode is enabled, every stage SHALL return a recorded response for the demo
scenario rather than calling the provider.

#### Scenario: The demo makes no provider call
- **WHEN** demo mode is on and the demo scenario runs
- **THEN** no Vertex request is issued and every stage returns its recorded response

#### Scenario: The demo is deterministic
- **WHEN** the demo scenario is run twice in demo mode
- **THEN** both runs produce identical stage outputs

#### Scenario: Fixtures are validated like any other response
- **WHEN** a recorded fixture is served
- **THEN** it is validated against the stage schema, so a stale fixture fails loudly rather than silently

### Requirement: Spend is measurable per provider

The system SHALL record input and output token counts per stage and SHALL expose
accumulated spend on an internal metrics route.

#### Scenario: Token counts are recorded
- **WHEN** a stage calls the provider
- **THEN** the reported input and output token counts are stored against that stage

#### Scenario: Spend is visible without a provider console
- **WHEN** the internal metrics route is read
- **THEN** it reports per-stage call counts, token totals and estimated cost

#### Scenario: A cache hit records no spend
- **WHEN** a stage is served from cache
- **THEN** the call is counted as a cache hit and adds no token cost

### Requirement: The client cannot pass a prompt through

The gateway SHALL accept only a named stage from an allowlist, and SHALL construct the
prompt itself.

#### Scenario: An unknown stage is refused
- **WHEN** a request names a stage that is not in the allowlist
- **THEN** it is rejected and no provider call is made

#### Scenario: Client-supplied prompt text is ignored
- **WHEN** a request includes prompt text alongside a stage name
- **THEN** the gateway builds the prompt from the stage definition and the validated input, and the supplied text is not sent to the provider

