# Kitchen Compiler — Project Context

## What this is

Kitchen Compiler turns "what's in the fridge" into an **executable meal-prep session**:
N portions across M dishes plus batch beverages, sauces and bases — cooled, portioned and
labeled — scheduled against a real time budget, real cooks, and real pans.

Recipe apps say *what* to cook. This says *how to get it out of the kitchen*: what starts
first, what happens while the rice cooks, which pan gets washed when, and who does what.

The unit of output is a **session**, not a dish.

## Architecture

```
Browser ── React SPA · @kitchen/scheduler (optimistic) · IndexedDB (cache + offline queue)
   │       NO SECRETS: public API URL, public Sentry DSN, short-lived tokens only
   │  HTTPS + WebSocket
Cloud Run: api      Fastify · device auth · sessions · ordered event log · WebSocket
   │                @kitchen/scheduler — AUTHORITATIVE
   │                → Vertex AI Gemini (ADC, no key) · Brave Search · ElevenLabs
Cloud Run: worker   BullMQ · scraping · JSON-LD extraction · normalization
   │
Postgres (+pgvector) · Redis (cache, queue, pub/sub) · Secret Manager
```

### Workspace

```
apps/
  web/        React 19 + Vite. Renders. Holds no secret.
  api/        Fastify + Node 20. The only thing that talks to a provider.
  worker/     BullMQ consumers. Long-running, CPU always allocated.
packages/
  domain/     Types + Zod schemas + the ingredient lexicon + verb ranges. Imports nothing.
  scheduler/  Pure, deterministic, zero I/O, no Node built-ins. Imports domain only.
  contracts/  API request/response schemas shared by web and api.
  recipes/    RecipeIR, seed packs, pack registry. Imports domain only.
```

**`packages/scheduler` compiles into both the API and the client bundle.** That is the
whole reason this is a workspace. The server is authoritative; the client computes
optimistically for instant feedback and reconciles. A second implementation would drift,
and the drift would surface as the timeline changing when you reconnect.

Dependencies flow one way: domain is a leaf; scheduler, contracts and recipes depend on
domain; applications depend on packages; **nothing depends on an application.** Enforced as
ESLint errors, and tested in `packages/domain/src/boundaries.test.ts`.

## Stack

| Concern | Choice |
|---|---|
| Client | React 19 + TypeScript 6 (`strict`, `noUncheckedIndexedAccess`) + Vite 8 |
| Styling | Tailwind 3.4 over CSS custom properties |
| Server | Fastify + Node 20 on Cloud Run (`min-instances=1`, session affinity) |
| Queue | BullMQ on Redis, as a second always-on Cloud Run **service** (not a Job) |
| Data | Postgres + pgvector, Drizzle migrations |
| Model | **Gemini on Vertex AI** via ADC — no model API key exists |
| Search | Brave Search behind a swappable provider interface |
| Voice | ElevenLabs — agent for intake, TTS + constrained STT for cooking mode |
| Validation | Zod 4 at every boundary; `responseSchema` generated from the same schemas |
| Test | Vitest 5 + Testing Library, one run across the workspace |

## Non-negotiables

1. **The scheduler is a pure function.** Identical inputs and an identical ordered event
   log yield byte-identical output, in the browser and on the server alike. Time and
   randomness are parameters, never ambient reads.
2. **The LLM never makes a scheduling decision.** It extracts, normalizes, ranks candidates
   and prettifies. Rationale always comes from the engine — a model would invent
   explanations for decisions it did not make.
3. **There is no model API key.** Vertex authenticates through the Cloud Run service
   account. Two provider secrets exist in total (Brave, ElevenLabs) and neither reaches the
   browser; `scripts/scan-bundle.mjs` fails the build if one does.
4. **No natural-language fallback parser.** The fallback for intake is the **structured
   form**, which is first-class and always reachable, not a degraded mode. The ingredient
   lexicon survives only as a dictionary — looking up a known term is not the same problem
   as extracting terms from speech.
5. **Three of five LLM stages are deterministic-first**: ranking (scoring), normalization
   (JSON-LD / microdata), explanation (templates). The model is the secondary path.
6. **No scraped recipe prose is stored or displayed.** Extract structure, keep
   `source: { url, siteName, retrievedAt }`, attribute visibly, link out, honour robots.txt.
7. **Food safety is a hard constraint.** A raw-meat surface never reaches produce without an
   interposed wash.
8. **The offline demo path survives.** The §10 scenario runs end to end with the API origin
   blocked, from bundled seed packs and the browser copy of the scheduler. Verified by
   blocking the domain, not by assuming.

## Sync model

Sync the **inputs and the ordered event log**. Never sync the schedule — it is derived, and
any device with the same inputs and the same log computes the same timeline. Tiny writes,
no merge conflicts on derived state, and a phone that loses signal keeps working.

`session_events.seq` is unique per session and assigned server-side.
`schedules.computedFromSeq` records which prefix of the log produced a schedule. Clients
reconnect with `lastSeq` and get a replay. Timers anchor to `GET /v1/time`, never to
`Date.now()` alone — two phones with drifting countdowns destroys trust instantly.

## Conventions

- **Naming:** `PascalCase` types, `camelCase` values, `kebab-case` files and capability ids.
- **Zod:** every exported domain type has a matching `XSchema`; derive the type with
  `z.infer` so schema and type cannot drift. Vertex `responseSchema` is generated from the
  same schemas, never hand-written.
- **Model strings:** all in one config module with a `MODEL_*` env override per stage. A
  deprecated model must be a config change, not a code change. **No Gemini 2.5 string
  anywhere** — those shut down in October 2026.
- **Ids:** stable, human-readable, deterministic (`task:salmon:sear:start`), never random.
  Scheduler tie-breaks resolve on task id.
- **Durations:** always minutes, always integers, field suffix `Min`.
- **Secrets:** one Secret Manager entry each, referenced by **version alias, not `latest`**;
  one service account per service, `secretAccessor` only on what that service needs.
- **Commits:** prefixed with the OpenSpec change id.

## Non-goals

Accounts with passwords, social features, grocery delivery, payments, nutrition tracking.
Spoonacular as a corpus backbone (its terms cap caching at one hour, which is incompatible
with owning a searchable corpus).

## Demo scenario (the acceptance target)

60 minutes · 4 portions · 2 cooks (intermediate + beginner) · 2 burners · 1 frying pan ·
1 saucepan · no oven. Must produce 3 dishes + 1 sauce + 2 beverages (one immediate, one
overnight cold brew), portioned, chilled and labeled within budget — **with the API origin
blocked**.
