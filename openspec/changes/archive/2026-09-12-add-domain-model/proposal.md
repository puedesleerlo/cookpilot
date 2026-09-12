## Why

Every other capability in Kitchen Compiler — recipe packs, the LLM pipeline, the
scheduler, the Gantt chart — reads and writes the same handful of nouns: an ingredient,
a cook, a piece of equipment, a task, a dish, a schedule. If those nouns are defined
twice they will drift, and the drift will surface as a scheduling bug that looks like a
UI bug. The domain layer is written first so that every later change imports its
vocabulary instead of inventing one.

It also has to carry the two properties the product is judged on: the scheduler must be a
pure function, and the app must work with no API key. Both are structural, not
incidental — they belong in the type system and the directory boundaries, established now.

## What Changes

- Introduce `src/domain/` as the single source of truth for all shared types, each one
  defined as a **Zod 4 schema** with the TypeScript type derived via `z.infer`, so a
  schema and its type cannot disagree.
- Model the vocabulary: `Ingredient`, `Cook`, `Equipment`, `Task`, `Dish`, `Dependency`,
  `SafetyConstraint`, `Constraints`, `MealPlan`, and the scheduler's output types
  (`Schedule`, `ScheduledTask`, `Lane`, `Rationale`, `DegradationEvent`, `ScheduleDiff`,
  `ScheduleMetrics`).
- Place scheduler **output** types in the domain layer specifically so `src/ui` can render
  a `Schedule` while remaining unable to import the engine that produces one.
- Establish the task model that makes parallelism expressible: every task carries a
  `phase` of `start` / `hold` / `finish` and a `requiresCook` flag, so a pan can be
  occupied for 25 minutes while a cook is occupied for 2.
- Enforce the layer boundaries as ESLint errors, including bans on `Date.now`,
  `Math.random`, `new Date()`, `fetch` and `crypto` inside `src/scheduler`.
- Provide a deterministic id builder and a test harness (`src/test/`) with fixture
  factories that later changes build their golden-file tests on.

## Capabilities

### New Capabilities
- `domain-model`: the shared vocabulary of the application — entity definitions, their
  validation schemas, the purity and layering guarantees, and deterministic identity.

### Modified Capabilities
None — this is the first change.

## Impact

- Creates `src/domain/`, `src/test/`.
- Creates `eslint.config.js` boundary rules that every later change is checked against.
- No user-visible behaviour yet; this change ships types, schemas and tests only.
