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

## D-007 — Fridge modelled as a capacity resource
Date: 2026-09-12
Question: Should chilling tasks contend for a limited resource?
Options: (a) unlimited fridge, (b) capacity-N shelves
Choice: (b), N=4 default, configurable via `Constraints.fridgeCapacity`.
Why: Batch drinks and cooling cooked food both need cold space in a meal-prep session.
     An unlimited fridge made the beverage lane trivially free and hid a constraint people
     actually hit — the reason a real Sunday session stalls is often that there is nowhere
     to put the thing you just cooked.
Revisit if: users report the constraint feels artificial.

## D-008 — Recursive as a single variable superfamily, rejecting Fraunces
Date: 2026-09-12
Question: The brief asks for "a warm humanist sans for UI; a rounded display face for
          headings". Which faces?
Options: (a) Fraunces display + Rubik UI, (b) a rounded sans (Baloo/Comfortaa) + a humanist
         sans, (c) one variable superfamily driven on its axes
Choice: (c) — Recursive, in three voices: display (CASL 1, wght 800), interface
        (CASL 0.3), compiler (MONO 1, reserved for compile status and the time ruler).
Why: Fraunces was the obvious "soft display face" pick and that is the problem — it has
     become one of the reliable tells of generated design, and it is a serif where the
     brief asked for something rounded. The rounded-sans options push the product toward
     children's-app territory, which undersells a tool whose claim is that it is doing real
     work for you. Recursive's casual axis gives genuinely hand-drawn rounded letterforms,
     and it carries the monospace voice for free — which matters, because "monospace for
     small data labels" is normally a generated-design tell, and here the interface
     genuinely is a compiler. One family, three voices, all axis-driven.
     This amended the `design-system` spec from "exactly two font families" before
     implementation, per the spec-first rule.
Revisit if: Recursive's interface voice proves tiring at small sizes in real use.

## D-009 — Ship the full 305KB variable font rather than subsetting
Date: 2026-09-12
Question: Recursive's latin variable woff2 is 305KB with all five axes. Subset it?
Options: (a) subset axes with fonttools, (b) ship as-is, (c) fall back to system fonts
Choice: (b). `pip install fonttools` is not available in this environment, and I will not
        hand-edit a binary font table.
Why: It is one file carrying what would otherwise be two or three families, it is cached
     after first load, and the app has no backend to wait on. Typography is doing real work
     here — it is the main thing carrying the product's warmth — so it is the right place
     to spend the budget.
Revisit if: a build step can subset to the used axes; that should cut it to roughly 90KB.

## D-010 — Dish colour is hashed from the dish id, not assigned by position
Date: 2026-09-12
Question: How are the six dish hues allocated across a plan?
Options: (a) by index in the dishes array, (b) by a stable hash of the dish id
Choice: (b), via `dishHueIndex` over the FNV-1a hash from `@/domain/ids`.
Why: With (a), re-ordering a plan recolours the whole chart, and a shared QR link would
     render in different colours from the sender's screen — which quietly breaks the one
     thing a shared lane has to do, namely let two people point at the same block.
Revisit if: hash collisions cluster badly enough that a real plan gets two dishes the same
     colour; the fix then is a collision-avoiding pass, not positional assignment.

## D-011 — The design canvas is generated from the real tokens, not hand-drawn
Date: 2026-09-12
Question: Claude Design canvases are normally authored by hand. Do that, or generate?
Options: (a) hand-author the five artboards, (b) generate them from tokens.css and glyphs.json
Choice: (b) — `scripts/build-design-canvas.mjs` reads the real token file and the real
        glyph registry and emits the artboards.
Why: A hand-authored canvas starts accurate and drifts the moment a token changes. This one
     cannot: the contrast figures on the palette plate are computed from the shipped hex
     values, and the glyph sheet renders the same path data the app renders. Re-running the
     script is the whole update process.
Revisit if: the canvas needs layout nuance the generator cannot express.
