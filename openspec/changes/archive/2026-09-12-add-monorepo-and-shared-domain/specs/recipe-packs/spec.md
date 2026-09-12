## MODIFIED Requirements

### Requirement: Bundled seed packs make the demo work offline

The system SHALL bundle at least four seed packs covering mains, bases, sauces and
beverages in `packages/recipes`, and those packs SHALL between them cover every ingredient
in the demo pantry.

Because the packs live in a shared package, the same content SHALL be available to the web
client for the offline demo path, to the API for internal search, and to the worker for
validating ingested recipes.

The demo scenario SHALL compile with the API origin blocked, using seed packs alone.

#### Scenario: The demo pantry is covered
- **WHEN** every ingredient in the demo pantry is looked up in the seed pack index
- **THEN** each one appears in at least one seed recipe

#### Scenario: Beverages are present, including an overnight one
- **WHEN** the seed packs are indexed by dish kind
- **THEN** at least three beverages exist, at least one of which starts in the session and finishes hours later

#### Scenario: Bases and sauces are present
- **WHEN** the seed packs are indexed by dish kind
- **THEN** at least two recipes of kind `base` and at least three of kind `sauce` exist

#### Scenario: The same packs serve every runtime
- **WHEN** the web client, the API and the worker each load the seed packs
- **THEN** all three read them from `@kitchen/recipes` rather than from their own copy
