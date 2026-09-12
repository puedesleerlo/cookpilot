# recipe-packs Specification

## Purpose
TBD - created by archiving change add-recipe-packs. Update Purpose after archive.
## Requirements
### Requirement: Recipes are structured, never prose

The system SHALL represent every recipe as a `RecipeIR`: canonical ingredients with
quantities, units and roles, plus ordered steps each carrying a cooking verb, a duration,
an active/passive split, equipment requirements, ingredient references, dependencies on
earlier steps, a task class, a minimum skill and an effort rating.

The system SHALL NOT store or display source recipe prose. Where a recipe came from
elsewhere, the system SHALL retain `source` with the URL, site name and retrieval time,
SHALL display that attribution wherever the recipe appears, and SHALL link out to the
original. Step wording shown to the user SHALL be the system's own.

#### Scenario: A step carries its own schedulable shape
- **WHEN** a recipe step says to simmer rice for 25 minutes
- **THEN** the `RecipeIR` step records a total duration of 25 minutes with roughly 1 active minute, the saucepan and a burner as equipment, and a dependency on the step that started it

#### Scenario: Imported prose is not retained
- **WHEN** a recipe is imported from a URL
- **THEN** the stored `RecipeIR` contains no field holding the original instruction text, and `source.url` and `source.siteName` are populated

#### Scenario: Attribution is visible
- **WHEN** a dish derived from an imported recipe is displayed
- **THEN** the site name is shown and links to the original URL

### Requirement: The active and passive split is explicit per step

Every `RecipeStep` SHALL record `durationMin` (wall-clock time the step occupies) and
`activeMin` (hands-on time at the start), and MAY record `finishMin` (hands-on time at the
end). The passive remainder SHALL be `durationMin - activeMin - finishMin` and SHALL NOT be
negative.

This is what a recipe has to give up for parallelism to be findable at all.

#### Scenario: Passive time is derivable
- **WHEN** a step has a duration of 25 minutes, 1 active minute and 1 finishing minute
- **THEN** its passive time is 23 minutes

#### Scenario: An over-allocated step is rejected
- **WHEN** a step declares 5 active minutes and 3 finishing minutes within a 6-minute duration
- **THEN** schema validation fails

### Requirement: Pack identity rests on a content hash

A `RecipePack` SHALL declare `packId`, `version`, `name`, `locale`, `provenance` of
`seed`, `imported` or `generated`, a `contentHash` derived from its recipes, and the
recipes themselves.

The hash SHALL be computed over a canonical serialisation in which object keys are sorted,
so that two packs with identical recipes hash identically regardless of key order.

#### Scenario: Identical content hashes identically
- **WHEN** two packs hold the same recipes with their JSON keys in different orders
- **THEN** both produce the same `contentHash`

#### Scenario: A tampered pack is reported
- **WHEN** a pack is loaded whose stored `contentHash` does not match its recipes
- **THEN** the pack still loads and a warning names the mismatch, rather than the load failing

#### Scenario: Seed pack hashes are correct as shipped
- **WHEN** the test suite recomputes the hash of every bundled seed pack
- **THEN** each matches the hash stored in the file

### Requirement: Bundled seed packs make the demo work offline

The system SHALL bundle at least four seed packs covering mains, bases, sauces and
beverages, and those packs SHALL between them cover every ingredient in the demo pantry.

The demo scenario SHALL compile with no network access and no API key, using seed packs
alone.

#### Scenario: The demo pantry is covered
- **WHEN** every ingredient in the demo pantry is looked up in the seed pack index
- **THEN** each one appears in at least one seed recipe

#### Scenario: Beverages are present, including an overnight one
- **WHEN** the seed packs are indexed by dish kind
- **THEN** at least three beverages exist, at least one of which starts in the session and finishes hours later

#### Scenario: Bases and sauces are present
- **WHEN** the seed packs are indexed by dish kind
- **THEN** at least two recipes of kind `base` and at least three of kind `sauce` exist

### Requirement: The pack index answers what the planner asks

The registry SHALL index loaded recipes by canonical ingredient name, by dish kind and by
tag, and SHALL answer which recipes a given pantry can make and how much of each recipe's
core ingredients the pantry covers.

#### Scenario: Coverage is computed against a pantry
- **WHEN** the index is asked for candidates for a pantry holding rice, chicken and bok choy
- **THEN** it returns recipes ranked by the fraction of their non-optional core ingredients the pantry supplies

#### Scenario: Pantry staples do not count against coverage
- **WHEN** a recipe requires salt, oil and soy sauce alongside chicken
- **THEN** the staples are treated as assumable and do not reduce the coverage score, but are reported as assumed

### Requirement: Import never crashes on bad input

The system SHALL accept a pasted pack JSON, or pasted recipe text normalized by LLM stage
L3. Where validation fails, the system SHALL attempt one repair pass; where that also
fails, it SHALL surface a clear failure naming what could not be parsed, and SHALL leave
previously loaded packs untouched.

#### Scenario: Malformed JSON is reported, not thrown
- **WHEN** a user pastes text that is not valid JSON into the pack importer
- **THEN** the importer returns a failure result naming the problem and the existing packs remain loaded

#### Scenario: A pack with one bad recipe keeps the good ones
- **WHEN** a pack is imported in which one recipe fails schema validation
- **THEN** the valid recipes are imported and the failure names which recipe was dropped and why

#### Scenario: Import works with no model available
- **WHEN** no API key is configured and a user imports a pack JSON
- **THEN** the import succeeds, because pack JSON import requires no model

### Requirement: Packs persist locally and export back out

Imported packs SHALL be persisted in IndexedDB and reloaded on the next visit. Any pack
SHALL be exportable as a `.json` file that re-imports without loss.

Where IndexedDB is unavailable, the application SHALL continue to run with seed packs only.

#### Scenario: Export round-trips
- **WHEN** a pack is exported and the resulting JSON is re-imported
- **THEN** the reimported pack has the same `contentHash` and the same recipe count

#### Scenario: Storage failure degrades rather than breaks
- **WHEN** IndexedDB throws on open
- **THEN** the registry still loads every seed pack and reports that imported packs are unavailable this session

### Requirement: A static registry lists distributable packs

The system SHALL publish `public/registry/index.json` listing each available pack with its
name, `packId`, `contentHash`, recipe count, byte size and a relative URL.

Adding a community pack SHALL require only adding a JSON file and a registry entry — no
backend and no database.

#### Scenario: The registry describes each pack without downloading it
- **WHEN** the registry index is fetched
- **THEN** each entry carries a name, hash, recipe count and size, so a user can choose before downloading

#### Scenario: Registry entries resolve
- **WHEN** the test suite reads the registry index
- **THEN** every entry's URL resolves to a file that exists and whose hash matches the entry

