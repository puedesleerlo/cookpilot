## Why

Everything built so far compiles a fridge that was typed in, against twenty-two recipes that
shipped in the bundle. That is a demo of the scheduler, not the product. The product is:
speak twice, and get a week of meals out of real recipes found on the web, scheduled.

## What Changes

The whole chain, end to end, with a model at every step that needs judgement:

1. **Voice.** Two spoken answers, transcribed by ElevenLabs. The browser never holds the
   key — it posts audio to the API and gets text back.
2. **L1 — intake.** Gemini turns the two transcripts into structured intake: what they want
   to cook, what they have, how many are cooking. Constrained decoding against the Zod
   schema, so the output is the type or it is not accepted.
3. **L2 — queries.** Gemini turns that intake into search queries worth running.
4. **Search and fetch.** Brave answers; the fetcher respects robots and takes the readable
   text of each page.
5. **L3 — extraction and adjustment.** Gemini reads each page and emits a `RecipeIR`:
   steps with verbs, durations, equipment and dependencies, scaled to the servings this
   session needs. Servings are derived, not asked: **seven days of meals for the people who
   are cooking**.
6. **Corrections.** The extracted recipes are shown before anything is scheduled, and can be
   corrected — a wrong duration, a missing pan, a dish dropped.
7. **The scheduler**, unchanged, on real recipes instead of seed packs.
8. **Corrections on the way**, and **cooking mode**.

## Capabilities

### New Capabilities
- `cook-pipeline`: the chain from two spoken answers to a compiled session — the stages,
  what each is allowed to decide, and what happens when one is unavailable.

### Modified Capabilities
- `llm-pipeline`: L2 and L3 become model-first rather than deterministic-first. The
  deterministic paths stay as the floor, not the default.

## Impact

- `apps/api`: voice, search, fetch, the three stage specs, and the routes that run them.
- `packages/contracts`: the request and response types for those routes.
- `apps/web`: the spoken intake, the corrections screen, and the route into the timeline.
- The API has to be deployed for any of this to work in a browser, because every key lives
  on it. Cloud Run.
