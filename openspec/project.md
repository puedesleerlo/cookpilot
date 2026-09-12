# Kitchen Compiler — Project Context

## What this is

Kitchen Compiler turns "what's in the fridge" into an **executable meal-prep session**:
N portions across M dishes plus batch beverages, sauces and bases — cooled, portioned
and labeled — scheduled against a real time budget, real cooks, and real pans.

Recipe apps say *what* to cook. This says *how to get it out of the kitchen*: what starts
first, what happens while the rice cooks, which pan gets washed when, and who does what.

The unit of output is a **session**, not a dish.

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript 6 (`strict`, `noUncheckedIndexedAccess`) |
| Build | Vite 8 |
| Styling | Tailwind CSS 3.4 + CSS custom properties for design tokens |
| Validation | Zod 4 at every boundary (LLM output, pack import, persisted state, share links) |
| State | Zustand |
| Persistence | IndexedDB (`idb`) for recipe packs and sessions |
| Test | Vitest 5 + Testing Library, `jsdom` |
| Sharing | `qrcode` + `lz-string` |
| Backend | **None.** No auth, no database, no server. Static hosting only. |

## Architecture — layer boundaries

These are enforced as **ESLint errors** in `eslint.config.js`, not conventions.

```
src/domain/     Types + Zod schemas. The shared vocabulary. Imports nothing.
src/recipes/    Pack loading, RecipeIR validation, import/normalize, registry.
src/llm/        The five bounded LLM stages. May call the model.
                Returns validated data. NEVER schedules.
src/scheduler/  Pure. Deterministic. Zero I/O. Zero randomness (seeded only).
                No `Date.now`, no `Math.random`, no `fetch` — lint-enforced.
src/app/        Composition root. Use-cases that wire llm + recipes + scheduler.
src/ui/         Renders. NEVER computes a schedule — it calls @/app use-cases.
src/assets/     Vector assets from Claude Design.
```

Rationale for `src/app/`: "UI never computes a schedule" is only enforceable if there
is somewhere else for orchestration to live. See `DECISIONS.md` D-002.

## Non-negotiables

1. **The scheduler is a pure function.** Identical input yields byte-identical output.
   Time and randomness are parameters, never ambient reads.
2. **The LLM never makes scheduling decisions.** It extracts, normalizes and prettifies.
   Every stage has a strict Zod schema, one repair retry, then a deterministic fallback.
3. **The app runs end-to-end with `VITE_ANTHROPIC_API_KEY` unset.** Seed packs and
   deterministic parsers cover every path. This is verified by test, not by hope.
4. **No scraped recipe prose is stored or displayed.** Extract structure, keep
   `source: { url, siteName, retrievedAt }`, attribute visibly, link out.
5. **Food safety is a hard constraint, not a preference.** A raw-meat surface never
   reaches produce without an interposed wash task.

## Conventions

- **Naming:** `PascalCase` types, `camelCase` values, `kebab-case` files and capability ids.
- **Zod:** every exported domain type has a matching `XSchema`; derive the type with
  `z.infer` so schema and type cannot drift.
- **Ids:** stable, human-readable, deterministic (`task:salmon:sear:start`), never random.
  Determinism of the scheduler depends on id stability for tie-breaking.
- **Durations:** always minutes, always integers, field suffix `Min`.
- **Tests:** colocated `*.test.ts`. Scheduler changes require a determinism test and a
  resource-safety property test.
- **Commits:** prefixed with the OpenSpec change id, e.g. `add-scheduling-engine: ...`.

## Non-goals

Accounts, social features, grocery delivery, payments, nutrition tracking, a large
recipe database, cross-device live sync. Do not build them.

## Demo scenario (the acceptance target)

60 minutes · 4 portions · 2 cooks (intermediate + beginner) · 2 burners · 1 frying pan ·
1 saucepan · no oven. Must produce 3 dishes + 1 sauce + 2 beverages (one immediate, one
overnight cold brew), portioned, chilled and labeled within budget — with no API key.
