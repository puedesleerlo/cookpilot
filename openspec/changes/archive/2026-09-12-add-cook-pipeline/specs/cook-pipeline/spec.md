# cook-pipeline

## ADDED Requirements

### Requirement: The chain SHALL run from two spoken answers to a compiled session
The pipeline MUST accept two recorded answers — what the user wants to cook, and what they
have together with how many are cooking — and MUST carry them through transcription,
structured intake, query building, search, fetch, extraction, correction and scheduling
without the user typing anything.

#### Scenario: Speaking twice
- **WHEN** two answers are recorded and submitted
- **THEN** the result is a set of extracted recipes scaled to this session
- **AND** every one of them carries the URL it came from

#### Scenario: A stage that cannot run
- **WHEN** a provider is unavailable
- **THEN** the chain continues on that stage's floor and says which stage was degraded
- **AND** it never presents degraded output as though a model produced it

### Requirement: No provider key SHALL reach the browser
Transcription, search, fetching and generation MUST run on the API. The client MUST hold no
provider key, and the bundle scanner MUST keep it that way.

#### Scenario: Transcribing
- **WHEN** the client transcribes an answer
- **THEN** it posts the audio to the API and receives text
- **AND** the ElevenLabs key appears nowhere in the client bundle

### Requirement: Intake SHALL be extracted by a model against a schema
L1 MUST turn transcripts into structured intake using constrained decoding against the
domain schema. It MUST NOT be a regex, a quantity extractor, or a keyword slot matcher.

#### Scenario: An ordinary answer
- **WHEN** someone says they have chicken, some bok choy going off, and rice
- **THEN** the intake holds those three as ingredients, with the bok choy marked urgent

#### Scenario: Something the lexicon has never heard of
- **WHEN** an ingredient is named that the lexicon does not know
- **THEN** it is kept under the name that was said, flagged, and not replaced

#### Scenario: The model is unavailable
- **THEN** the structured form is the floor, and the user is told the transcript could not
  be read

### Requirement: Recipes SHALL be found and read by a model, not by a template
L2 MUST build the search queries and L3 MUST read each fetched page into a `RecipeIR` with
steps, verbs, durations, equipment and dependencies. Structured markup MAY accelerate this
but MUST NOT be the only path, because most pages do not carry usable markup for steps.

#### Scenario: A page with no structured markup
- **WHEN** a fetched page carries no JSON-LD
- **THEN** the model still produces steps from the page's text

#### Scenario: A page that is not a recipe
- **WHEN** a fetched page is a listing or an article rather than a recipe
- **THEN** it is discarded rather than turned into a recipe with invented steps

### Requirement: Fetching SHALL respect robots and identify itself
The fetcher MUST read `robots.txt` before fetching, MUST honour a disallow, MUST send a
descriptive user agent, and MUST apply a timeout and a size cap.

#### Scenario: A disallowed path
- **WHEN** robots.txt disallows the path
- **THEN** the page is not fetched and the candidate is dropped

### Requirement: Servings SHALL be derived from the week, not asked for
The session MUST target seven days of meals for the people who are cooking. Servings per
dish MUST be derived from that target and the number of dishes, never entered by hand.

#### Scenario: Two people cooking
- **WHEN** two people are cooking
- **THEN** the session targets fourteen portions
- **AND** each dish is scaled so the dishes together reach that target

#### Scenario: Scaling a recipe
- **WHEN** a recipe yielding four is scaled to seven
- **THEN** its ingredient quantities scale
- **AND** its step durations stay inside the plausible range for their verb, because frying
  twice as much chicken does not take twice as long

### Requirement: Extracted recipes SHALL be correctable before scheduling
The user MUST see what was extracted, and MUST be able to change a duration, add or remove
equipment, or drop a recipe, before the scheduler runs.

#### Scenario: A duration that is wrong
- **WHEN** a step's duration is corrected
- **THEN** the session is recompiled against the corrected value

#### Scenario: Dropping a recipe
- **WHEN** a recipe is dropped
- **THEN** it takes no part in the plan and the remaining dishes are rescaled to the target
