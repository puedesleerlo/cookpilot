## ADDED Requirements

### Requirement: Structured markup is the primary extraction path

The system SHALL attempt `schema.org/Recipe` extraction from JSON-LD first, then from
microdata, and SHALL reach for a model only when both fail.

The system SHALL record which path produced each result, so that reliance on the model is
measurable rather than assumed.

#### Scenario: JSON-LD is preferred
- **WHEN** a page carries both JSON-LD and microdata
- **THEN** the JSON-LD result is used and the method is recorded as `json-ld`

#### Scenario: Microdata is the fallback
- **WHEN** a page carries microdata but no JSON-LD Recipe
- **THEN** the microdata result is used and the method is recorded as `microdata`

#### Scenario: The method is recorded for every ingestion
- **WHEN** an ingestion job completes
- **THEN** its stored method names which path produced the result

### Requirement: Extraction survives the shapes real sites emit

The extractor SHALL handle a Recipe node at the top level, inside `@graph`, or under
`mainEntity`; an `@type` given as a string or an array; `recipeInstructions` given as a
string, an array of strings, an array of `HowToStep`, or a `HowToSection` wrapping steps;
and durations given as ISO 8601 or as loose text such as "45 mins".

A page with several JSON-LD blocks, one of which is malformed, SHALL still yield its
recipe.

#### Scenario: A Recipe nested in a graph is found
- **WHEN** the page's JSON-LD is an `@graph` array whose third entry is the Recipe
- **THEN** the recipe is extracted

#### Scenario: Sectioned instructions are flattened in order
- **WHEN** instructions are a `HowToSection` containing `HowToStep` entries
- **THEN** the steps are returned in document order with their section wrapper removed

#### Scenario: A malformed block does not lose a good one
- **WHEN** a page has two JSON-LD blocks and the first is invalid JSON
- **THEN** the recipe in the second is still extracted

#### Scenario: ISO durations become minutes
- **WHEN** a recipe declares `PT1H30M`
- **THEN** the extracted total time is 90 minutes

### Requirement: A page that is not a recipe yields no recipe

The extractor SHALL return a failure, naming what was missing, for a page with no Recipe
markup. It SHALL NOT infer a recipe from a category index, a roundup or a site page.

#### Scenario: A category page is rejected
- **WHEN** a recipe-index or roundup page is extracted
- **THEN** the result is a failure naming what was absent, and no recipe is produced

#### Scenario: Markup without ingredients is rejected
- **WHEN** a page carries a Recipe node with a name but no `recipeIngredient`
- **THEN** extraction fails naming the missing ingredients

### Requirement: Extracted durations are checked for plausibility

Durations derived from a page SHALL be checked against the plausible-range table for the
step's cooking verb, and an implausible value SHALL be replaced by the table's conservative
value rather than scheduled.

#### Scenario: An implausible simmer is corrected
- **WHEN** a page claims rice simmers for 3 minutes
- **THEN** the derived step uses the table's conservative duration and the correction is recorded

#### Scenario: A plausible duration is kept
- **WHEN** a page states a 25-minute simmer
- **THEN** that duration is used unchanged

### Requirement: Source prose is read and discarded

The system SHALL retain `source` with the page URL, site name and retrieval time, and SHALL
store its own step wording.

No field of a stored recipe SHALL contain the source page's instruction text verbatim.

#### Scenario: Attribution is retained
- **WHEN** a recipe is extracted from a page
- **THEN** the stored recipe carries the URL, the site name and the retrieval time

#### Scenario: Verbatim prose is not stored
- **WHEN** an extracted recipe is compared with the source page
- **THEN** no stored step text is identical to a source instruction

### Requirement: Crawling is polite and identifies itself

The system SHALL honour robots.txt, SHALL send a user agent identifying the bot with a
contact URL, and SHALL serialise requests per domain with a delay between them.

Where robots.txt is absent or unreachable, the system SHALL treat the page as disallowed.

#### Scenario: A disallowed path is not fetched
- **WHEN** robots.txt disallows the path
- **THEN** no request for that page is made

#### Scenario: The longest matching rule wins
- **WHEN** robots.txt disallows `/recipes/` and allows `/recipes/public/`
- **THEN** a page under `/recipes/public/` is allowed

#### Scenario: A rule containing regular-expression characters is handled
- **WHEN** robots.txt contains a rule such as `Disallow: /*?filters[`
- **THEN** the rule is applied without error

#### Scenario: An unreachable robots.txt is treated as refusal
- **WHEN** robots.txt cannot be fetched
- **THEN** the page is not fetched
