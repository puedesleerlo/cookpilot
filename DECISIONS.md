# Decisions

Every judgment call made without operator input. Append-only.

---

## D-001 — React 19 / Zod 4 / Vite 8 instead of the specified React 18
Date: 2026-09-12
Question: The brief specifies React 18. `npm i react` resolves to 19.3. Pin back or take current?
Options: (a) pin React 18 + Zod 3 + Vite 5, (b) take current majors
Choice: (b) — React 19.3, Zod 4.6, Vite 8, TypeScript 6, Vitest 5.
Why: Nothing in the product needs React-18-specific behaviour, and pinning three majors
     back invites security patching work and stale-type friction for zero demo benefit.
     Zod 4's `z.infer` + discriminated unions are what the domain layer leans on and are
     strictly better than Zod 3's. The brief's intent was "modern React app", not "18".
Revisit if: a required library turns out to lack React 19 support.

## D-002 — Added a `src/app/` layer not listed in the brief
Date: 2026-09-12
Question: The brief's rule is "src/ui never computes a schedule", but its directory map
          gives orchestration nowhere to live, so UI would have to call the scheduler.
Options: (a) let UI import the scheduler barrel and rely on discipline,
         (b) add `src/app/` as a composition root holding use-cases
Choice: (b). `src/ui` is lint-forbidden from importing `@/scheduler/*` and `@/llm/*` at all.
Why: "Never computes a schedule" is only a real constraint if it is enforceable. With (a)
     the rule is a comment; with (b) it is an ESLint error. Scheduler *output* types live in
     `src/domain`, so the UI can render a Schedule without being able to produce one.
Revisit if: the app layer turns into a pass-through with no logic of its own.

## D-003 — Boundaries enforced with `no-restricted-imports`, not a plugin
Date: 2026-09-12
Question: How to enforce the layer rules — `eslint-plugin-boundaries` or built-ins?
Options: (a) eslint-plugin-boundaries, (b) per-`files` `no-restricted-imports` overrides
Choice: (b), plus `no-restricted-globals`/`no-restricted-properties` to ban `Date.now`,
        `Math.random`, `fetch`, `crypto` and `new Date()` inside `src/scheduler`.
Why: One less dependency, and the purity rules (no ambient clock, no ambient randomness)
     needed the globals/properties rules anyway — which the plugin does not cover.
Revisit if: the rule list outgrows readability in `eslint.config.js`.

## D-004 — `beverage-base` added to the ingredient category enum
Date: 2026-09-12
Question: The brief fixes seven ingredient categories; coffee beans, tea and juice bases
          fit none of them well ("pantry" hides them).
Options: (a) force coffee beans into `pantry`, (b) add a `beverage-base` category
Choice: (b).
Why: Beverages are a first-class output of a session and get their own illustration in the
     design system. Folding their inputs into `pantry` would make the beverage lane
     invisible in the pantry review screen — the one place the user confirms the compiler
     understood them.
Revisit if: the category never influences scoring or iconography.

## D-005 — `soiled` added to the contamination state set
Date: 2026-09-12
Question: The brief lists clean / raw-meat / raw-fish / raw-egg / allergen:*. A pan that
          just cooked beef is in none of those, but it is not `clean` either.
Options: (a) treat post-cooking as `clean`, (b) add a distinct `soiled` state
Choice: (b).
Why: Without it the model cannot distinguish "needs a wash for safety" from "needs a wash
     because it tastes of beef". The first is a hard constraint, the second is a
     preference the scheduler is allowed to trade away — and the degradation ladder needs
     that distinction to avoid dropping food instead of dropping a rinse.
Revisit if: nothing ever reads `soiled` differently from `clean`.

## D-006 — Cook skill and task-class eligibility are independent axes
Date: 2026-09-12
Question: Should an eleven-year-old be modelled as `skill: 'beginner'`?
Options: (a) skill alone gates tasks, (b) skill and an explicit `eligibleFor` list
Choice: (b). `HELPER_TASK_CLASSES` is the default helper set: wash, measure, mix, blend,
        steep, strain, assemble, garnish, portion, label, chill, wash-up.
Why: Skill answers "can they pull it off"; eligibility answers "may they be handed it".
     A confident adult who will not touch fish and a child who may not go near the stove
     are the same modelling problem, and collapsing them into skill would either give the
     kid the hot pan or make the adult useless. The helper set is deliberately wide —
     a second pair of hands with three eligible tasks is not a second pair of hands.
Revisit if: eligibility lists become tedious enough that users stop editing them.
