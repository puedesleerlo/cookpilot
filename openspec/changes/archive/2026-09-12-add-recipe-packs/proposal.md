## Why

Everything downstream consumes recipes, and none of it can consume prose. The task-graph
compiler needs durations split into active and passive, equipment per step, dependencies
between steps and food-safety annotations. A paragraph that says "meanwhile, steam the bok
choy" contains all of that and exposes none of it.

So recipes enter the system as a normalized intermediate representation, and this change
builds the supply chain that produces it: bundled seed packs that make the demo work with
no network and no API key, an import path for a URL or pasted text, and a static registry
so a community pack is a pull request rather than a backend.

This lands before plan generation because plan generation has nothing to select from until
it does.

## What Changes

- Define `RecipeIR` in the domain layer: canonical ingredients with quantities and roles,
  and ordered steps carrying verb, duration, **the active/passive split**, equipment,
  dependencies, delay windows, task class, minimum skill and effort.
- Define the pack envelope — `packId`, `version`, `contentHash`, `name`, `locale`,
  `provenance`, `recipes` — with identity resting on a content hash of the recipes.
- Ship five bundled seed packs covering the demo scenario plus bases, sauces and
  beverages. These are non-negotiable: the demo must compile with no network.
- Build the pack registry: load, validate, index by canonical ingredient, and query.
- Build import: paste a pack JSON, or paste recipe text that LLM stage **L3** converts to
  `RecipeIR`, with one repair retry and then a deterministic rule-based parser. Bad input
  produces a clear "couldn't parse this one" state, never a crash.
- Build the LLM client that L3 and every later stage shares: timeout, one retry, schema
  validation at the boundary, a recorded-fixture mode for tests, and a debug log.
- Persist imported packs in IndexedDB; export any pack back out as a `.json` file.
- Publish a static `public/registry/index.json` listing available packs.

**No scraped recipe prose is stored or displayed.** We extract structure, keep
`source: { url, siteName, retrievedAt }`, attribute visibly in the UI and link out. Step
wording shown to the user is our own.

## Capabilities

### New Capabilities
- `recipe-packs`: the recipe intermediate representation, the pack format and its identity,
  the bundled seed content, import and normalization, persistence, export and the registry.
- `llm-pipeline`: the shared model client — schema-validated boundaries, repair retry,
  deterministic fallback, and the debug log — plus stage L3, recipe normalization.

### Modified Capabilities
- `domain-model`: adds `RecipeIR`, `RecipeStep` and `RecipePack` to the shared vocabulary.

## Impact

- Creates `src/recipes/`, `src/llm/`, `public/registry/`.
- Adds `RecipeIR` types to `src/domain/`.
- Adds an IndexedDB store; the app still runs with storage unavailable, falling back to
  seed packs only.
