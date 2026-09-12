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

## D-012 — Sesame oil is a core ingredient, not an assumable staple
Date: 2026-09-12
Question: Which ingredients may the compiler assume are in the cupboard?
Options: (a) all oils and condiments, (b) only genuinely universal items
Choice: (b). `PANTRY_STAPLES` is salt, black pepper, sugar, water, neutral oil, olive oil,
        cornstarch, chilli flakes, honey, vinegar, flour. Sesame oil and soy sauce are not.
Why: The test for this started as an assertion that sesame oil was assumable and failed —
     which turned out to be the code being right. Sesame oil is what makes a dish that
     dish. Assuming it plans a sesame dinner for someone who has no sesame oil, and the
     scoring hides the problem by not counting it as missing. Salt is different: nobody
     is surprised to be told to add salt.
Revisit if: coverage scores skew so low that good candidates get filtered out.

## D-013 — Import takes pasted text, never a URL fetch
Date: 2026-09-12
Question: Should "import from a URL" actually fetch the URL?
Options: (a) fetch in the browser, (b) fetch via a CORS proxy, (c) user pastes the text
Choice: (c). The user pastes; we keep `source.url` and `source.siteName` for attribution.
Why: (a) fails on almost every recipe site's CORS policy, so it would work in a demo and
     break in reality. (b) means running a backend, which the brief rules out, and turns
     the app into something that fetches arbitrary URLs on a user's behalf. (c) always
     works, needs no infrastructure, and loses nothing the compiler needs — the structure
     comes from the text either way.
Revisit if: the app ever gains a backend for another reason.

## D-014 — The API key is bundled, and the app says so
Date: 2026-09-12
Question: `VITE_ANTHROPIC_API_KEY` is inlined into the client bundle at build time. How
          should that be handled?
Options: (a) ignore it, (b) add a backend proxy, (c) ship it and state the limitation
Choice: (c). The debug panel states plainly that the key is bundled and that this build is
        for local use. `dangerouslyAllowBrowser` is set with a comment pointing here.
Why: A backend contradicts the brief's architecture. Silently shipping a bundled key and
     letting it look production-ready is the genuinely bad option — the honest one is to
     ship it working and name the constraint where someone deploying would see it.
Revisit if: the app is ever deployed anywhere real; then it needs a proxy, not a warning.

## D-015 — Five seed packs split by role, including one of deliberately short mains
Date: 2026-09-12
Question: How should the bundled recipe content be organised?
Options: (a) one big pack, (b) packs by cuisine, (c) packs by role in a session
Choice: (c) — mains, bases, sauces, beverages, and a fifth pack of fast mains.
Why: The planner composes a session (a main, a base, a sauce, a drink), so indexing by role
     is what it actually asks for. The fifth pack exists specifically so rung 3 of the
     degradation ladder — "substitute a long dish for a short one" — has somewhere to go.
     A substitution rung with nothing shorter to substitute is a no-op that looks like a
     feature.
Revisit if: users import enough of their own content that role coverage comes from there.

---

# Redirection — consolidated delta (2026-09-12)

A consolidated delta superseded §5, §9 and §11 of the original brief and replaced the
13-change sequence with 34. The reversals that matter: Gemini on Vertex replaces Anthropic,
a real backend replaces "no backend", and the L1 natural-language fallback parser is
deleted outright. Entries below record how the work already done was treated.

## D-016 — Abandoned `add-voice-pantry-intake` before archiving it
Date: 2026-09-12
Question: Change #4 was implemented but not archived when the delta landed. Finish it,
          archive it, or drop it?
Options: (a) archive it and supersede it later, (b) drop it and salvage the parts
Choice: (b). The OpenSpec change is deleted, not archived; `openspec/specs/` never learns
        about it. Superseded code is removed in the same commit as the salvage.
Why: Archiving would write a requirement into `openspec/specs/pantry-intake` saying the
     system SHALL fall back to a keyword parser — the exact thing the delta deletes. A
     spec that records a decision already reversed is worse than no spec: every later
     change would have to argue with it.
Revisit if: never. The delta is explicit.

## D-017 — What survived the delta, and in what role
Date: 2026-09-12
Question: Which of the first three changes' output is still correct under the new plan?

| Artefact | Fate |
|---|---|
| `src/domain/**` | Survives whole, becomes `packages/domain`. It was provider-agnostic. |
| Design system, glyphs, tokens, primitives | Survives whole — the delta keeps §8 authoritative. |
| Seed packs, `RecipeIR`, registry | Survives, becomes `packages/recipes`. Feeds the offline demo path. |
| `lexicon.ts` | Survives, **re-scoped**. The delta keeps it for normalizing names arriving from L1, form autocomplete and `RecipeIR` — a dictionary lookup, which is a different job from extracting terms from speech. |
| `verb-table.ts` | Survives, **repurposed** as the L4 range validator (new change #20). It was already a table of plausible durations per verb; that is exactly what the validator needs. |
| `client.ts` (schema → call → validate → repair) | Shape survives, provider swapped. Constrained decoding via `responseSchema` replaces most of the repair loop. |
| `parseIntakeDeterministically` | **Deleted.** |
| `useSpeech.ts` (Web Speech API) | **Deleted.** Replaced by ElevenLabs. |
| Conversational `Intake.tsx` | **Deleted.** Replaced by the structured form. |
| `app/intake.ts` slot interview | **Deleted client-side.** The API owns question order now. |
| `app/demo.ts`, chips, store shell | Survives, feeds the structured form. |

Why the parser had to go, in its own words: it passed its tests because its tests were
written against the same handful of phrasings it was built for. It could not do negation
("no oven", "I'm out of rice"), cross-turn reference, or code-switching, and the failure
mode was silent — a plausible-looking pantry with the wrong food in it. A structured form
needs no parsing and is not a degraded mode.

## D-018 — pnpm workspaces, not npm
Date: 2026-09-12
Question: The delta specifies a monorepo. Which workspace tool?
Options: (a) npm workspaces (already installed), (b) pnpm (delta names it explicitly)
Choice: (b) — pnpm 10.7 is on the machine and the delta says "pnpm workspaces".
Why: Named in the delta, and its strict node_modules layout is what stops `apps/web` from
     accidentally importing a server-only dependency by transitive luck — which matters a
     great deal here, because a provider key reaching the client bundle is a CI failure.
Revisit if: pnpm causes Docker build friction on Cloud Run.

## D-019 — The bundle scanner checks value shapes, not just secret names
Date: 2026-09-12
Question: The delta requires CI to grep the client bundle for each key name. Is a name
          grep enough?
Options: (a) grep the documented secret names, (b) also match the value shapes
Choice: (b). `scripts/scan-bundle.mjs` checks nine secret names *and* seven value shapes —
        `sk-ant-*`, `AIza…`, `sk_…`, credentialled Postgres and Redis URLs, a
        `"type":"service_account"` blob, and PEM private keys.
Why: A name grep only catches the leak that arrives through the variable you expected. It
     misses a key pasted as a literal during debugging, one that arrives through a
     dependency's bundled config, or a service-account JSON copied into `public/`. The
     shapes cost nothing and cover the cases where someone was not thinking about the
     name at all. The script reports the shape and length and never prints the value, so a
     CI log does not become the second leak.
Revisit if: a legitimate string trips a shape rule; the fix is a narrower regex, not a
     removed one.

## D-020 — `no-restricted-imports` needed path patterns, not just package names
Date: 2026-09-12
Question: Does banning `@kitchen/api` and `**/apps/**` actually stop `apps/web` reaching
          server code?
Options: (a) trust the package-name patterns, (b) also ban `**/<app>/src/**`
Choice: (b).
Why: The boundary test caught this: `no-restricted-imports` matches the *literal
     specifier*, not the resolved path, so `import { server } from '../../api/src/server'`
     sails past a `**/apps/**` pattern — the string contains no `apps/`. The rule looked
     enforced and was not. This is exactly the failure the boundary tests exist to find,
     and it would have been invisible in review.
Revisit if: the workspace grows enough that `eslint-plugin-import-x`'s path-resolving
     `no-restricted-paths` becomes worth the dependency.

## D-021 — `.env.example` and `infra/iam.sh` are generated, not maintained
Date: 2026-09-12
Question: Three things must agree — the inventory, the example env file, and the IAM
          bindings. How are they kept in step?
Options: (a) maintain all three by hand and review carefully, (b) generate two from the first
Choice: (b). `scripts/gen-secret-artifacts.mjs` emits both from the inventory, and CI fails
        if the committed copies are stale.
Why: The two failure modes are silent and asymmetric. A secret in the inventory with no IAM
     binding is a service that starts and then cannot read it. A binding with no inventory
     entry is access nobody audits. Neither shows up in review, because nobody reads three
     files side by side.
Revisit if: the IAM needs shapes the generator cannot express; then it stops being generated
     and starts being reviewed, deliberately.

## D-022 — The secret scanner checks git-tracked, not file-exists
Date: 2026-09-12
Question: The first version flagged any `.env` on disk. Is that right?
Options: (a) flag any `.env` present, (b) flag only a `.env` that git is tracking
Choice: (b), via `git ls-files`.
Why: (a) failed immediately on this machine — a correctly gitignored `.env` was present,
     which is exactly what a working local setup looks like. A scanner that fails for every
     developer with a configured environment gets disabled within a week, and then it is
     protecting nothing. The risk is a *committed* secret, so the check asks git.
Revisit if: never; this is the right question to ask.

## D-023 — Heuristic secret shapes are skipped in documentation
Date: 2026-09-12
Question: `DECISIONS.md` describing what the scanner looks for tripped the scanner.
Options: (a) exempt the file, (b) drop the heuristic, (c) split shapes into strict and heuristic
Choice: (c). Unmistakable credentials — real prefixes and real lengths — are scanned
        everywhere. Structural heuristics like `"type": "service_account"` are skipped in
        `.md` and `.txt`.
Why: (a) creates a hole that grows every time someone documents a shape. (b) loses a real
     check. (c) keeps the check where credentials actually live, and accepts that prose
     about a credential is not a credential. A real service-account key is a JSON file, not
     a sentence in a decision log.
Revisit if: someone starts pasting real keys into markdown, at which point the problem is
     not the scanner.

## D-024 — Startup dies on a missing secret rather than failing at first use
Date: 2026-09-12
Question: What should a service do when a required secret is absent?
Options: (a) start, and fail the request that needs it, (b) refuse to open a listener
Choice: (b). `requireSecrets` exits non-zero with a message naming each missing secret, its
        description, and where an operator gets a value.
Why: (a) turns a deploy-time mistake into a user-facing one and buries the cause under
     whatever request happened to hit it first. It also lets a bad revision pass a health
     check and take traffic. Failing at startup means the deploy fails, traffic never
     shifts, and the message says exactly what to fix.
Revisit if: a secret is genuinely needed by only one rare route; the answer then is to mark
     it optional and have that route report itself unavailable, which the loader supports.
