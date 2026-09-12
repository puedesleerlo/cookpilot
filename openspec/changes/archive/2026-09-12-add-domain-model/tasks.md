## 1. Primitives and identity

- [x] 1.1 Add `src/domain/primitives.ts`: `Unit`, `Allergen`, `SkillLevel`, `TaskClass`, `EquipmentKind`, `DishKind`, `ContaminationState`, `TimeWindow`, `CookingVerb` — each as a Zod schema with an inferred type.
- [x] 1.2 Add `src/domain/ids.ts`: deterministic `makeId(...parts)` with slugification, plus typed helpers `taskId`, `dishId`, `ingredientId`.
- [x] 1.3 Unit-test slugification and stability of `makeId`.

## 2. Entities

- [x] 2.1 Add `src/domain/ingredient.ts` — `IngredientSchema` with urgency, prep state, category, allergens.
- [x] 2.2 Add `src/domain/crew.ts` — `CookSchema` (skill, `eligibleFor`, availability windows) and `EquipmentSchema` (count, capacity, contamination state).
- [x] 2.3 Add `src/domain/task.ts` — `DependencySchema` with min/max delay cross-check, `SafetyConstraintSchema`, `EquipmentRequirementSchema`, `TaskSchema` with the phase/`requiresCook` invariant.
- [x] 2.4 Add `src/domain/dish.ts` — `DishSchema`, `MealPlanSchema`, plan scoring shape.
- [x] 2.5 Add `src/domain/constraints.ts` — `ConstraintsSchema` including fridge capacity, restrictions, optimization mode.

## 3. Scheduler output types

- [x] 3.1 Add `src/domain/schedule.ts` — `ScheduledTask`, `Lane`, `Rationale`, `DegradationEvent`, `ScheduleMetrics`, `Schedule`, `ScheduleDiff`.
- [x] 3.2 Add `src/domain/index.ts` barrel re-exporting every schema and type.

## 4. Boundaries

- [x] 4.1 Confirm `eslint.config.js` forbids cross-layer imports for domain, scheduler, recipes, llm and ui.
- [x] 4.2 Confirm `src/scheduler/**` bans `Date.now`, `new Date()`, `Math.random`, `fetch`, `crypto`, `performance`, `localStorage`, `indexedDB`.
- [x] 4.3 Add a test that lints two throwaway fixture files — one violating a boundary, one not — and asserts the violation is reported.

## 5. Test harness

- [x] 5.1 Add `src/test/factories.ts` with override-accepting factories for each entity.
- [x] 5.2 Add `src/domain/domain.test.ts`: every factory parses; invariant violations are rejected (negative duration, hold-with-cook, min>max delay, unknown contamination state).

## 6. Close out

- [x] 6.1 `npm run lint`, `npx tsc -p tsconfig.app.json --noEmit`, `npm test` all clean.
- [x] 6.2 `openspec validate add-domain-model --strict` clean.
- [x] 6.3 Log decisions in `DECISIONS.md`; archive the change; commit.
