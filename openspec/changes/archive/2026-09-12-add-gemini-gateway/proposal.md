## Why

The model provider changes from Anthropic to Gemini on Vertex, and the reason that matters
is not the model — it is the authentication. Vertex authenticates through the Cloud Run
service account's Application Default Credentials, so there is **no model API key at all**.
That is one fewer secret in the inventory rather than one more, and it is why the client
bundle scanner has nothing to look for on this path.

Two other things get settled here. Model strings all move into one config module with an
env override per stage, because a deprecated model must be a config change rather than a
code change — and there are Gemini 2.5 models shutting down within weeks of writing, so
this is not hypothetical. And stage output is constrained at generation time by a
`responseSchema` generated from the same Zod schemas used to validate it, which does most
of the work the old generate-then-repair loop was doing.

## What Changes

- Add the Vertex client, authenticated by ADC. No key is read, stored or transmitted.
- Add `apps/api/src/llm/models.ts`: every model string in one place, one per stage, each
  overridable by environment variable. **No Gemini 2.5 string anywhere** — those shut down
  in October 2026 and one in this codebase is a scheduled outage.
- Generate each stage's `responseSchema` from its Zod schema, so the constraint the model
  generates under and the schema the response is validated against cannot diverge.
- Keep Zod validation as a second gate: constrained decoding shapes the JSON, it does not
  make it semantically right.
- Add a content-hash cache in `llm_cache`: identical input returns the stored response at
  zero cost. Never cache or log pantry contents or transcripts as plain text.
- Add per-stage cost accounting from the reported token counts, surfaced on an internal
  metrics route.
- Add **demo fixtures**: recorded stage responses for the §10 scenario, served instead of
  calling Vertex when demo mode is on, so the on-stage run is instant, deterministic and
  independent of network latency.
- Add a stage allowlist. The client never passes a prompt through; it names a stage.

## Capabilities

### Modified Capabilities
- `llm-pipeline`: replaces the provider, adds the model config rule, constrained decoding,
  the cache, cost accounting, demo fixtures and the stage allowlist.

## Impact

- Creates `apps/api/src/llm/{models,vertex,gateway,fixtures}`.
- Replaces the provider-less `callStage` shell left by the monorepo change.
- Adds `GET /internal/metrics` reporting per-provider spend.
