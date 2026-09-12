## 1. The intermediate representation

- [x] 1.1 Add `src/domain/recipe.ts`: `RecipeStepSchema` with the phase budget refinement, `RecipeIRSchema`, `RecipePackSchema`, `PackProvenance`.
- [x] 1.2 Export from the domain barrel; add `passiveMinOf(step)` helper.
- [x] 1.3 Tests: phase budget over-allocation rejected; delay windows validated; source retained without prose.

## 2. The shared LLM client

- [x] 2.1 Add `src/llm/client.ts`: `callStage({ name, schema, system, buildUser, fallback, effort })` with timeout, structured outputs, one repair retry, deterministic fallback, and `source: 'model' | 'repaired' | 'fallback'`.
- [x] 2.2 Add `src/llm/debug.ts`: an in-memory ring buffer of stage runs, redacting the API key.
- [x] 2.3 Add `src/llm/config.ts`: key detection, model id, per-stage effort, timeout.
- [x] 2.4 Tests with a stubbed transport: happy path, repair path, double-failure fallback, timeout fallback, no-key path makes no request, log never holds the key.

## 3. The cooking-verb rule table

- [x] 3.1 Add `src/llm/fallbacks/verb-table.ts` mapping every `CookingVerb` to duration, active/passive split, equipment, task class, minimum skill and effort.
- [x] 3.2 Test: every verb in the enum has an entry, and every entry's split is internally consistent.

## 4. Stage L3 — recipe normalization

- [x] 4.1 Add `src/llm/stages/normalize.ts`: prompt, schema, and a deterministic parser over an ingredients block plus one instruction per line.
- [x] 4.2 Tests: structured text becomes a valid `RecipeIR`; fallback parser handles the common shape; unparseable text fails cleanly with a named reason.

## 5. Seed packs

- [x] 5.1 Author `seed-asian-weeknight`, `seed-bases`, `seed-sauces`, `seed-beverages`, `seed-fast-mains` as JSON in `src/recipes/seed/`.
- [x] 5.2 Add `scripts/stamp-packs.mjs` to compute and write each `contentHash`; run it.
- [x] 5.3 Tests: every pack validates; hashes are current; the demo pantry is fully covered; kind counts meet the spec floors.

## 6. Registry, import, storage, export

- [x] 6.1 Add `src/recipes/registry.ts`: load seed packs, index by canonical ingredient, kind and tag, and answer pantry-coverage queries with staples treated as assumable.
- [x] 6.2 Add `src/recipes/import.ts`: pack JSON import with per-recipe failure isolation, and text import through L3.
- [x] 6.3 Add `src/recipes/storage.ts`: IndexedDB persistence that degrades to seed-only when storage is unavailable.
- [x] 6.4 Add `src/recipes/export.ts`: pack to downloadable JSON, round-tripping without loss.
- [x] 6.5 Publish `public/registry/index.json` and a test that every entry resolves and matches its hash.

## 7. Close out

- [x] 7.1 Lint, typecheck, test and build clean.
- [x] 7.2 `openspec validate add-recipe-packs --strict` clean.
- [x] 7.3 Log decisions; archive; commit.
