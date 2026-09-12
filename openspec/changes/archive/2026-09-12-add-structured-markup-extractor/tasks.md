## 1. Extraction

- [x] 1.1 Add `packages/recipes/src/extract/jsonld.ts`: JSON-LD Recipe extraction over every real-world shape.
- [x] 1.2 Add microdata/RDFa extraction as the fallback.
- [x] 1.3 Add ISO 8601 duration and yield parsing, including the loose-text cases sites actually emit.
- [x] 1.4 Return a named failure for a page with no recipe, rather than inferring one.

## 2. Measurement

- [x] 2.1 Add `scripts/measure-extraction.mjs` with robots.txt handling, bot identification and per-domain rate limiting.
- [x] 2.2 Discover real recipe URLs from each site rather than hand-writing them.
- [x] 2.3 Classify recipe pages from their own visible text, never from the URL or the markup being measured.
- [x] 2.4 Run against live sites and record the result in `design.md`.

## 3. Mapping to RecipeIR

- [x] 3.1 Add `packages/recipes/src/extract/to-ir.ts`: extracted markup to `RecipeIR`, with our own step wording.
- [x] 3.2 Infer verb, equipment and the active/passive split from the instruction text and the verb table.
- [x] 3.3 Apply the plausible-range check and record corrections.
- [x] 3.4 Retain `source` and never the source prose.

## 4. Tests

- [x] 4.1 Fixture-based tests for every JSON-LD shape, using markup shapes taken from the measured sample.
- [x] 4.2 Malformed-block, missing-ingredient and not-a-recipe cases.
- [x] 4.3 Duration plausibility: an implausible value is corrected, a plausible one is kept.
- [x] 4.4 Prose: no stored step text matches a source instruction verbatim.
- [x] 4.5 robots.txt: longest match, regex-metacharacter rule, unreachable means refused.

## 5. Close out

- [x] 5.1 `pnpm check` clean.
- [x] 5.2 `openspec validate add-structured-markup-extractor --strict` clean.
- [x] 5.3 Log decisions; archive; commit.
