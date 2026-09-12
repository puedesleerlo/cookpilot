## Why

The consolidated delta replaces the single-bundle, no-backend architecture with a Cloud Run
API, a queue worker, Postgres and a browser client. Those four surfaces share one set of
types and — critically — **one scheduler**.

The scheduler is the reason this has to be a workspace rather than a server with a client
stapled on. It runs in two places: authoritatively on the API, and optimistically in the
browser so the offline demo path survives a conference wifi failure. If it is copied, the
two copies drift, and the drift shows up as a schedule that changes when you reconnect.
Compiling one package into both is the only version of that which holds.

This change also retires the assumption baked into the first three changes — that the
client could hold a provider key — by giving server-only code somewhere to live that the
web bundle cannot reach.

## What Changes

- Convert the repository to a **pnpm workspace**: `apps/web`, `apps/api`, `apps/worker`,
  `packages/domain`, `packages/scheduler`, `packages/contracts`, `packages/recipes`.
- Move the existing domain layer into `packages/domain` unchanged; it was already
  provider-agnostic and needs no edits.
- Move recipe packs, `RecipeIR` and the registry into `packages/recipes`, so the browser
  can hold seed packs for the offline path and the worker can validate ingested ones.
- Re-scope the ingredient lexicon to name normalization and form autocomplete, and move it
  into `packages/domain`. **Delete the natural-language slot parser**: no lexicon, regex or
  keyword slot-matcher survives anywhere.
- Repurpose the cooking-verb table as the **L4 plausible-range validator** rather than a
  fallback step generator.
- Establish `packages/scheduler` as a pure package with no dependency other than
  `packages/domain`, buildable for both Node and the browser.
- Replace the layer-boundary lint rules with package-boundary rules, and add the rule that
  matters most: `apps/web` may not import `apps/api`, and no server-only package may enter
  the client bundle.
- Remove the Anthropic SDK. The model provider is replaced in a later change.

## Capabilities

### New Capabilities
- `monorepo-architecture`: the workspace layout, the package dependency rules, the
  shared-scheduler guarantee, and how the client bundle is kept free of server code.

### Modified Capabilities
- `domain-model`: layer boundaries become package boundaries; the lexicon joins the domain.
- `llm-pipeline`: removes the requirement that L1 falls back to a deterministic parser.
- `recipe-packs`: packs move to a shared package consumed by browser, API and worker.

## Impact

- Every source path moves. No behaviour changes in this change.
- `eslint.config.js` boundary rules are rewritten against package names.
- Deletes `src/llm/stages/intake.ts`, `src/ui/useSpeech.ts` and the conversational intake
  screen, which the delta supersedes.
