## ADDED Requirements

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

### Requirement: The model provider contributes no secret

The system SHALL authenticate to Vertex AI through the service account's Application
Default Credentials and SHALL NOT read, store, log or transmit a model API key.

#### Scenario: No model key is read
- **WHEN** the Vertex client is constructed
- **THEN** it is given a project and a location, and no credential value

#### Scenario: The secret inventory has no model entry
- **WHEN** the secret inventory is filtered for the model provider
- **THEN** it is empty

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
