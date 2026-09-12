## Why

Most recipe sites already publish `schema.org/Recipe` as JSON-LD, because Google's rich
results require it. If that is true often enough, then LLM normalization is an edge case
rather than the main path — and the difference between those two positions is the
difference between extraction being free, instant and deterministic, and it being slow,
metered and occasionally wrong.

So this change builds the deterministic extractor **first**, and measures its hit rate on
twenty real URLs before anything else is written. That measurement is the point: it decides
how much the ingestion worker needs the model at all, and it belongs in this change's
`design.md` as a number rather than an assumption.

## What Changes

- Add a `schema.org/Recipe` extractor over JSON-LD, including the `@graph` and array
  shapes real sites actually emit, and a microdata/RDFa fallback for the ones that do not.
- Map extracted markup onto `RecipeIR`: ISO 8601 durations, the many shapes
  `recipeIngredient` and `recipeInstructions` take, yield parsing, and the verb inference
  the structured data does not carry.
- Apply the **plausible-range table** to every derived duration, so a page claiming a
  three-minute risotto is corrected rather than scheduled.
- Store `source: { url, siteName, retrievedAt }` and never the source prose. Step wording
  shown to a user is ours.
- Honour robots.txt, identify the bot with a contact URL, and rate limit per domain.
- Record which path produced each result — `json-ld`, `microdata` or `llm` — so a weak
  extractor shows up as a metric instead of a bill.
- Measure the hit rate on twenty real URLs and record it in `design.md`.

## Capabilities

### New Capabilities
- `recipe-extraction`: turning a page into `RecipeIR` — the ordered extraction strategy,
  what is kept and what is discarded, the plausibility floor, and the crawling manners.

## Impact

- Creates `packages/recipes/src/extract/`, used by the ingestion worker in the next change.
- No model dependency: this path is entirely deterministic.
