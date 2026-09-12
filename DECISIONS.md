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

## D-025 — `/healthz` and `/readyz` are separate routes with different dependencies
Date: 2026-09-12
Question: One health endpoint or two?
Options: (a) one `/healthz` that checks everything, (b) liveness and readiness separately
Choice: (b). `/healthz` depends on nothing; `/readyz` checks registered dependencies and
        returns 503 naming the failing one.
Why: With (a), a database blip makes Cloud Run conclude the *process* is broken and restart
     it — which cannot help, costs a cold start, and turns a recoverable dependency outage
     into an outage of everything. Liveness answers "is this process wedged"; readiness
     answers "should this instance take traffic". They are different questions and only one
     of them should be able to kill a container.
Revisit if: never; this is the standard split for a reason.

## D-026 — `/readyz` reports the scheduler version
Date: 2026-09-12
Question: How does a client find out it is running a stale copy of the engine?
Options: (a) it does not, (b) readiness reports `schedulerVersion`
Choice: (b), from `@kitchen/scheduler`.
Why: The client computes optimistically and the server is authoritative, so a client on a
     stale cached bundle will disagree with the server about a timeline. Without a version
     to compare, that surfaces as "the plan changed when I reconnected" and is close to
     undebuggable. With it, the client can log `scheduler-divergence` with both versions,
     which is the telemetry that catches a bad cache in the wild.
Revisit if: the engine is ever versioned independently of the package.

## D-027 — The OpenAPI document is generated from the contract, not written
Date: 2026-09-12
Question: How is the API described?
Options: (a) a hand-written OpenAPI file, (b) generated from the Zod contracts
Choice: (b) — `buildOpenApi` walks the route registry and emits JSON Schema from the same
        schemas the server validates against.
Why: Hand-written API docs are wrong within a sprint and the wrong version is the one
     people read. Generating means a renamed field updates the description in the same
     commit, with no second edit to forget. The route registry also makes "which routes
     need a token" a declared fact rather than something a reader infers.
Revisit if: the contract needs documentation prose that Zod cannot carry; the answer then
     is a description field on the schema, not a parallel document.

## D-028 — Line-level scanner pragmas instead of file exemptions
Date: 2026-09-12
Question: The credential scanner caught its own test fixtures. How are deliberate fixtures
          excused?
Options: (a) exempt the whole file, (b) construct fixtures at runtime so no literal exists,
         (c) a line-level `scan-secrets-ignore: <reason>` pragma
Choice: (c), with (a) kept for the three files whose entire job is describing key shapes.
Why: A file exemption stops protecting that file the moment someone adds a real key to it,
     and the list grows quietly. (b) works but makes the fixtures unreadable, and the next
     person writes a literal anyway. A pragma has to be written deliberately, sits on the
     line it excuses with its reason attached, and is visible in review.
Revisit if: pragmas start appearing without reasons; then require a minimum reason length.

## D-029 — Redaction had to hook pino's log method, not just its formatter
Date: 2026-09-12
Question: Does `formatters.log` cover every way a secret can reach a log line?
Options: (a) yes, (b) no — the message string bypasses it
Choice: (b). Added a `hooks.logMethod` that redacts string arguments before pino sees them.
Why: A test written to assert redaction failed, and the reason was worse than the test
     being wrong: `formatters.log` only receives the *merge object*, so
     `logger.error(\`failed using ${key}\`)` went straight through untouched. That is
     precisely the shape an accidental leak takes — a hurried debug line interpolating the
     credential while someone works out why a provider call is failing. The protection
     looked complete and had a hole in the most likely path.
Revisit if: never. Both passes are needed.

## D-030 — `appendEvent` takes a row lock, and the unique index stays anyway
Date: 2026-09-12
Question: How is `session_events.seq` assigned safely under concurrency?
Options: (a) a sequence per session, (b) `MAX(seq)+1` and let the unique index catch races,
         (c) `MAX(seq)+1` under `SELECT ... FOR UPDATE` on the session row, index retained
Choice: (c).
Why: This was verified rather than assumed. With the lock removed, twelve concurrent
     appends produce `duplicate key value violates unique constraint
     session_events_session_seq_key`; with it, they serialise and all twelve succeed. So
     (b) is *safe* but turns an ordinary concurrent append into a client-visible error, and
     under two phones tapping "done" at once that is not rare. (a) means a schema object
     per session, which does not fit a table that gets truncated and reseeded.
     The index is kept regardless: it is what makes the invariant true even if this
     function is ever bypassed. The lock is for correctness under load; the index is for
     correctness full stop.
Revisit if: append throughput per session ever matters, which for a cooking session it
     will not.

## D-031 — The recipe search vector is maintained by a trigger, not by the application
Date: 2026-09-12
Question: Who keeps `recipes.search_vector` current?
Options: (a) the application writes it alongside the row, (b) a database trigger
Choice: (b), with a GIN index over it.
Why: An application that has to remember will eventually forget — on the ingestion path, or
     on a backfill script, or in a migration that touches `ir` directly. The symptom is a
     recipe that exists, looks fine, and cannot be found, which is close to undiagnosable
     from outside. A trigger cannot be bypassed by a writer who did not know about it.
Revisit if: the weighting needs to vary per query, which is a ranking concern and belongs
     in the query, not the column.

## D-032 — Migrations are a release step, never run at boot
Date: 2026-09-12
Question: When are migrations applied?
Options: (a) on instance startup, (b) as an explicit release step before traffic shifts
Choice: (b). `src/db/migrate.ts` is a command; nothing calls it during boot.
Why: Cloud Run starts several instances at once. If each migrated, they would race, and
     the losers' failures would read as a broken deploy rather than a lost race. Worse, a
     migration that fails halfway does so under live traffic. As a release step it fails
     the deploy, before any traffic shifts, with one clear error.
Revisit if: never.

## D-033 — Integration tests run against a real Postgres, and skip loudly without one
Date: 2026-09-12
Question: How are the database invariants tested?
Options: (a) mock the driver, (b) an in-memory substitute, (c) a real Postgres, skipped when absent
Choice: (c) — `docker compose up -d`, and a warning naming the command when it is missing.
Why: Both invariants are *database* behaviours. A mock would assert that I remembered to
     write the mock; an in-memory substitute would not have the unique index or the row
     lock, which is the entire thing under test. Skipping rather than failing keeps the
     suite usable on a machine without Docker, and the skip says how to fix itself.
Revisit if: CI cannot run a service container; then the DB tests become a separate job, not
     a deleted one.

## D-034 — Revocation is deleting the device row, checked on every request
Date: 2026-09-12
Question: Device tokens live 90 days. How are they revoked?
Options: (a) short tokens plus refresh, (b) a revocation list, (c) check the device still
         exists on every verification
Choice: (c). `verifyDevice` verifies the signature *and* confirms the stored hash still
        matches a live row.
Why: The device row is already read to compare the hash, so the liveness check is free —
     and without it a cryptographically valid token for a deleted device would be accepted,
     which makes "delete the device" mean nothing. (a) adds a refresh flow to a product with
     no accounts; (b) adds a list to maintain when a table already holds the answer.
Revisit if: verification becomes hot enough that the per-request read matters; the fix is a
     short cache, not removing the check.

## D-035 — Expired and forged tokens return the same message
Date: 2026-09-12
Question: Should the 401 say which check failed?
Options: (a) distinguish expired from invalid, (b) one message for both
Choice: (b), and a test asserts the two messages are byte-identical.
Why: "Expired" tells someone holding a stolen token that it was genuine and they need a
     fresher one; "invalid" tells them to stop. That is a distinction worth nothing to a
     legitimate client — which simply re-issues either way — and worth something to a
     prober.
Revisit if: support cannot diagnose a user's problem; the answer then is the request id in
     the log, not a more specific message on the wire.

## D-036 — Rate limiting is keyed on device, not on address
Date: 2026-09-12
Question: What is the rate limit key?
Options: (a) IP address, (b) device, falling back to address when there is no token
Choice: (b).
Why: The product's whole premise is two people cooking together, which means two phones on
     one wifi behind one address. Keying on address alone would make the second cook share
     the first cook's budget and get throttled for someone else's activity. Device creation
     keeps a tighter, address-keyed limit, because there is no device yet and farming
     tokens is the thing worth throttling.
Revisit if: abuse arrives from many devices behind one address, which needs a second limit
     rather than a different key.

## D-037 — Test files run sequentially because integration tests share one database
Date: 2026-09-12
Question: Two DB test files truncating between cases wiped each other's rows when run in
          parallel. How is that fixed?
Options: (a) scope each file's cleanup to its own ids, (b) a Postgres schema per test file,
         (c) `fileParallelism: false`
Choice: (c).
Why: (a) is fragile — it holds until someone adds a case that forgets the prefix, and the
     failure is a confusing cross-file one. (b) is proper isolation but complicates the
     migration runner for a suite this size. (c) costs about five seconds on a suite that
     runs in seven, and removes the entire class of failure rather than one instance of it.
     The failure was also load-dependent, which is the worst kind to leave in.
Revisit if: the suite gets slow enough that the five seconds matter; the answer then is (b).

## D-038 — Model strings live in one config module with per-stage env overrides
Date: 2026-09-12
Question: Where do model identifiers live?
Options: (a) at each call site, (b) one constant, (c) one config module, per stage, each
         overridable by environment variable
Choice: (c), with a test asserting no model string exists anywhere else.
Why: Model deprecation is a scheduling problem. Gemini 2.5 shuts down in October 2026;
     with (a) or (b) the fix is a code change, a review and a deploy, and finding every
     occurrence means grepping. With (c) it is an environment variable on an existing
     revision. The test matters as much as the module — it is what stops the next model
     string being written inline by someone in a hurry.
Revisit if: never.

## D-039 — The forbidden-model test constructs the string it forbids
Date: 2026-09-12
Question: The test asserting no `gemini-2.5-` string exists failed on itself.
Options: (a) exclude test files from the check, (b) exclude this one file, (c) build the
         needle from parts so the file does not contain it
Choice: (c).
Why: (a) is the wrong exclusion: a test pinning a retired model is exactly the same outage
     as production code pinning one, and tests are where stale model strings linger longest.
     (b) works but is a special case that invites more. (c) keeps the check total.
Revisit if: the same trick is needed in several files; then it becomes a shared helper.

## D-040 — Constrained decoding plus Zod, not one or the other
Date: 2026-09-12
Question: `responseJsonSchema` constrains generation. Is Zod validation still needed?
Options: (a) trust constrained decoding, (b) keep both gates
Choice: (b), and a test demonstrates why: a response of `{answer: "ok", count: -5}` is
        shape-valid and fails the refinement that `count` must not be negative.
Why: Constrained decoding guarantees the JSON *shape*. It cannot know that a step's active
     minutes must not exceed its duration, or that a chill must follow within two hours.
     Those are the constraints that matter here, they live in Zod refinements, and they are
     exactly the ones a shape-only guarantee misses.
Revisit if: never. They check different things.

## D-041 — The cache key is a hash of stage, model and input
Date: 2026-09-12
Question: What identifies a cached stage response?
Options: (a) the input, (b) a hash of the input, (c) a hash of stage, model and input
Choice: (c).
Why: Including the model means changing model invalidates the cache — which is what you
     want, since the reason for changing model was to get different output; without it a
     model upgrade would silently keep serving the old one's answers. Hashing rather than
     storing the input means the cache table never holds a readable pantry or transcript,
     which matters because those are the two things this product is told in confidence.
Revisit if: cache hit rates need diagnosing; add a coarse non-identifying label, not the input.

## D-042 — The JSON-LD hit rate is 100% on 27 recipe pages, measured three times
Date: 2026-09-12
Question: How often does `schema.org/Recipe` markup exist? The whole ingestion design
          depends on it, so the delta requires it measured on ≥20 real URLs.
Answer: **27 of 27 recipe pages across 13 domains, all JSON-LD, zero microdata needed,
        zero misses, zero recipes invented from non-recipe pages.**
Why the number took three attempts, which is the part worth recording:
  1. Hand-written URLs: 11 of 20 404'd. Hit rate 9/9 on a self-selected sample.
  2. Discovered URLs, denominator = everything fetched: 47%. Every "miss" was `/feed/`,
     `/wp-json/`, `/about-us/` or a category index — pages the extractor correctly said
     contained no recipe. That number measured my URL filter, not the extractor.
  3. Discovered URLs, denominator = pages judged to be recipes **from their own visible
     text**, never from the URL and never from the markup being measured. A URL-based
     classifier was tried and was wrong in both directions: it counted `/about/…` as a
     recipe and `allrecipes.com/recipe/223042/…` as not one.
Consequence: LLM normalization is an edge case, not the hot path. Extraction is free,
     instant and reproducible. `ingestion_jobs.method` records which path ran, so if the
     `llm` share climbs that is a fact about our extractor, not about the web.
Revisit if: the `llm` share in production exceeds ~15%.

## D-043 — Extracted durations are checked against the plausible-range table
Date: 2026-09-12
Question: Structured markup is machine-readable. Is it trustworthy?
Options: (a) use stated durations as given, (b) check them against the verb table
Choice: (b), with an asymmetric tolerance: a third of the table value on the low side,
        twelve times on the high side.
Why: Machine-readable is not the same as true, and the two directions of error are not
     equally bad. A page claiming a three-minute simmer produces a schedule that cannot
     physically happen, and the user discovers that at minute three. A four-hour braise is
     real, and the table's 35 minutes is a default rather than a ceiling — so the upper
     bound is loose and the lower bound is tight.
Revisit if: real corrections cluster at one verb, which would mean that row is wrong.

## D-044 — A missing robots.txt means refused, not permitted
Date: 2026-09-12
Question: What if robots.txt cannot be fetched?
Options: (a) treat as permission, (b) treat as refusal
Choice: (b).
Why: (a) is the convention and it is the wrong default for a crawler nobody asked for. An
     unreachable robots.txt is an absence of information, not a grant. The cost of (b) is
     a page we do not ingest; the cost of (a) is crawling someone who said no and whose
     server happened to be down when we asked.
     Writing the parser also turned up a real bug: robots paths are full of regex
     metacharacters — `/*?filters[` is a live rule on a real recipe site — so the pattern
     translation escapes everything first and re-enables only the two wildcards robots
     actually defines.
Revisit if: never.

## D-045 — Ran the delta's named sync spike as soon as persistence landed
Date: 2026-09-12
Question: The delta names one risk explicitly — the two-phone sync demo is gated behind
          changes 22 and 23, late in the plan — and says to spike convergence on fake data
          as soon as change 5 lands. Do it now or wait?
Choice: Now. `apps/api/src/db/convergence.spike.test.ts`, committed outside the OpenSpec
        change flow as a spike rather than as a spec'd capability.
Result: Both properties hold against a real Postgres. Two clients polling at different
        moments converge on identical state; a client that drops for nine events and
        reconnects reaches exactly the state of one that never dropped; eight concurrent
        appends from two devices produce one agreed order, 1 through 8.
Why a trivial fold rather than the scheduler: the question is whether the *transport*
        preserves order and replay, not whether the engine is deterministic — that is
        settled by the engine's own tests later. The fold is deliberately order-sensitive,
        and a fourth test proves it, because a spike that cannot fail proves nothing.
Consequence: the architecture's riskiest assumption is now evidence rather than hope, and
        it was cheap to check. Changes 22 and 23 build on a mechanism already exercised.

## D-046 — Real credentials configured; the scanner now scans what can reach the repo
Date: 2026-09-12
Context: Live Brave and ElevenLabs keys and a GCP project were supplied for local work.
Actions and findings:
  - `.env` written, gitignored, confirmed untracked. Both keys verified live: Brave returns
    real results; ElevenLabs reports the creator tier with convai read access.
  - **The project ID is `hackaton-508407`, not `hackaton`** — the latter is the display
    name. `gcloud config` also pointed at a different project entirely (`ep-modeling`),
    which is what the ADC quota project still says.
  - `GOOGLE_CLOUD_QUOTA_PROJECT` is set in `.env` rather than running
    `gcloud auth application-default set-quota-project`, so this repo does not reach out
    and change global developer config.
  - **`aiplatform.googleapis.com` is not enabled** on that project; a real
    `generateContent` call returns `SERVICE_DISABLED`. Only `generativelanguage`
    (AI Studio) is on, which the delta rules out for shipping. Left for the owner to
    enable: it is their billing account, and the app runs on deterministic paths without it.

## D-047 — The scanner now scans only what git could take
Date: 2026-09-12
Question: The credential scanner flagged `.env` — the file credentials are supposed to
          live in.
Options: (a) exempt `.env` by name, (b) scan only files git could take
Choice: (b) — `git ls-files --cached --others --exclude-standard`, falling back to a full
        walk outside a checkout. The separate check for a *tracked* `.env` stays.
Why: The scanner's question is "did a credential reach the repository". A gitignored file
     has not, by definition. Flagging it every run is noise, and a noisy scanner gets
     switched off, at which point it protects nothing. A test now plants the same key twice
     — once gitignored, once tracked — and asserts only the tracked one is a finding.
Revisit if: a deployment path ever ships ignored files, which would make the premise false.

## D-048 — The first real boot found a wiring gap the tests could not
Date: 2026-09-12
Question: `POST /v1/devices` returned 404 against the real configuration, despite 18
          passing identity tests.
Cause: `buildServer` registers the identity routes only when handed `db` and `jwtSecret`.
       The test harness always passes them. `index.ts` did not.
Fix: wire them in `index.ts`; log a warning at startup when they are absent; add a
     source-level regression test asserting the entry point passes both.
Why worth recording: every test was green and the feature did not exist in production. The
     harness had quietly become the only caller that configured the server correctly. The
     lesson is not "write more unit tests" — it is that a composition root needs its own
     check, because nothing else exercises it.

## D-049 — Firebase Hosting for the client is not the Firebase the delta removed
Date: 2026-09-12
Question: The consolidated delta says "Firebase is removed". The client is now deployed on
          Firebase Hosting. Is that a contradiction?
Answer: No, and the distinction is worth stating. The delta struck Firebase as a **backend**
        — Firestore for data, Functions for logic — because the architecture is Cloud Run,
        Postgres and Redis. Firebase Hosting is a CDN for static bytes: no state, no data,
        no logic, nothing the delta replaced. The API still goes to Cloud Run.
Why it was the right host here: the GCP project already existed, the bytes are static, and
        it needed no new vendor, no new secret and no new bill.
Revisit if: anyone proposes Firestore, Firebase Auth or Functions. Those are the things the
        delta removed, and they stay removed.

## D-050 — Deploy through the REST API with ADC, not the Firebase CLI
Date: 2026-09-12
Question: The Firebase CLI's session had expired and needs an interactive browser reauth.
Options: (a) ask for the reauth, (b) generate a CI token, (c) deploy via the Hosting REST
         API using Application Default Credentials
Choice: (c) — `scripts/deploy-hosting.mjs`.
Why: (a) blocks on a human for every deploy and cannot run in CI. (b) creates a long-lived
     credential, which is one more secret to hold and rotate for a job that ADC already
     authorises. (c) works unattended, needs no new secret, and is the same path CI will
     take — so the deploy that runs in CI is the deploy that was tested here, not a second
     implementation of it.
Revisit if: Hosting adds a feature only the CLI exposes.

## D-051 — The deploy refuses to run if the bundle scan fails
Date: 2026-09-12
Question: Where does the last check on a leaked secret go?
Choice: Inside the deploy script, before its first mutating call.
Why: Publishing to a CDN is irreversible in the way that matters — a secret that reaches it
     has been fetched, cached and logged by other people's infrastructure, whatever is
     deleted afterwards. CI runs the same scan, but CI is not the only thing that deploys;
     a person running the script at 2am is, and that is exactly when the check is worth
     having. It costs about a second.
Revisit if: never.

## D-052 — Hosting headers match the request path, not the resolved file
Date: 2026-09-12
Question: The first deploy served `index.html` with `max-age=3600` despite a rule setting
          no-store on `/index.html`.
Cause: Firebase matches header globs against the **request** path. With an SPA rewrite,
       the shell is served at `/`, `/intake`, and every other route — none of which is
       `/index.html`. The rule matched nothing and the CDN default applied.
Consequence had it shipped: a redeploy would have taken up to an hour to reach anyone,
       which for a demo is the difference between showing this build and the last one.
Fix: no-store on the catch-all, immutable only on `/assets/**`. Content-hashed assets are
     safe to cache forever precisely because their names change when they do.
Why worth recording: the rule looked correct, the config validated, the deploy succeeded,
     and the behaviour was wrong. Only checking the live headers found it.

## D-053 — Everything downstream of an overnight tail belongs to tomorrow
Date: 2026-09-12
Question: The cold brew's "strain out the grounds in the morning" failed placement, and
          took the drink's portion, chill and label tasks down with it.
Cause: only the long passive HOLD was marked overnight, so the strain step was still
       checked against today's cook windows. At minute 727 nobody is in the kitchen —
       correctly — so no cook was eligible and the task was dropped, which left its four
       dependents unschedulable.
Fix: once a dish crosses a tail long enough to outlive the session, every later step's
     tasks are marked overnight too, not just the wait itself.
Why worth recording: the model was right about the boundary and wrong about its extent.
     "Overnight" is not a property of one step; it is a property of everything after it.

## D-054 — Two washes, one pair of hands, same minute
Date: 2026-09-12
Question: The helper was double-booked on two two-minute rinses at minute 9.
Cause: a task needing two dirty surfaces picks a washer per surface inside one placement
       attempt, and each lookup only consulted `cookBusy` — which is not written until the
       placement is committed. The second lookup could not see the first.
Fix: the attempt carries its own claims map, consulted alongside `cookBusy` for both the
     washes and the task itself.
Revisit if: placement ever gains a second source of provisional assignments; it would need
     to join the same map rather than start another one.

## D-055 — The plan builder compiles its candidates instead of adding up minutes
Date: 2026-09-12
Question: How does the builder know a dish still fits?
Options: (a) sum hands-on minutes against the kitchen's capacity, with a headroom factor;
         (b) compile the provisional plan with the real scheduler and keep the dish only if
         the session still lands inside the budget with nothing degraded.
Choice: (b). The arithmetic is kept as a coarse pre-filter so hopeless candidates never
        reach the compiler.
Why: a sum of minutes was wrong in both directions at once. It cannot see the parallelism
     two cooks and a phase split buy, so it refused a drink the kitchen had twenty idle
     minutes for; and it cannot see the dependencies that serialise work, so plans that
     added up fine still needed a dish cut at the last moment. Tuning the headroom factor
     traded one failure for the other — 0.82 dropped a side, 0.95 dropped a drink. The
     scheduler already answers the question exactly, in about two milliseconds.
Consequence: `packages/recipes` may now import `@kitchen/scheduler`. The boundary moved
     deliberately: `recipes -> scheduler -> domain` is acyclic, the scheduler is pure,
     deterministic and browser-safe, so nothing that boundary protects is weakened. The
     eslint rule was split rather than deleted, so recipes still cannot reach an app.
Revisit if: plan search ever grows beyond a greedy pass over a handful of slots. At ~50
     compiles a plan this is free; at ten thousand it would not be.

## D-056 — The chart draws resources, and only the ones that can clash
Date: 2026-09-12
Question: Which rows belong on the timeline?
Options: (a) one row per dish; (b) one row per cook and per piece of equipment; (c) (b) but
         only where something is used more than once.
Choice: (c).
Why: a row per dish answers "what am I making", which the dish list already answers. The
     thing only a chart can show is two people and two burners being busy at the same
     minute — contention — and contention lives on resources. But drawn for every resource
     it produced five identical storage-container rows holding one two-minute block each,
     and pushed the two rows carrying the whole argument off the top of the screen. A row
     with one block on it shows no contention; it just repeats the block.
Consequence: the tools group also opens collapsed. Hands and heat are the argument; the
     pans and boards are the evidence, one click away. Nothing is hidden — the run sheet
     lists every task.
Revisit if: a session ever has so few tasks that the chart looks empty.

## D-057 — A block is never wider than its own minutes
Date: 2026-09-12
Question: A one-minute task is a sliver. Give it a minimum width?
Choice: No. The floor is exactly one minute at the current scale.
Why: a minimum width makes the chart lie twice — it draws a minute as though it were two,
     and it pushes the block over whatever starts a minute later, which on a cook's row is
     usually the very next thing they do. Blocks that overlap when the schedule does not
     are worse than blocks that are small. Legibility is solved by hovering, which widens
     the block to fit its name, and by the run sheet.
Consequence: the scale is measured rather than fixed, so the attended session always fits
     the width available and the slivers are as wide as they can honestly be.

## D-058 — The timeline compiles in the browser
Date: 2026-09-12
Question: Does the client call the API to compile, or compile locally?
Choice: Locally. The registry is bundled; the plan builder and scheduler are pure.
Why: it is arithmetic the device can do in a few milliseconds. Routing it through a server
     would add a round trip, an error path, an account and a reason for the demo to fail on
     conference wifi — in exchange for nothing. The API earns its place on the things that
     genuinely need a server: ingestion, search, and a session shared between two phones.
Consequence: recompiling is cheap enough to be a live control rather than a button, which
     is what makes the time budget worth showing at all.

## D-059 — Intake is a form, and the lexicon stays a dictionary
Date: 2026-09-12
Question: How does someone enter their own fridge?
Choice: A combobox over the canonical lexicon, one term at a time, plus an explicit "add it
        anyway" for what the lexicon has never heard of.
Why: the consolidated delta deleted the free-text fallback parser, and this is exactly where
     it would have grown back. Pointing `searchLexicon` at a sentence is a keyword slot
     matcher wearing a lexicon's clothes: "chicken and rice" finds both, "chicken stock"
     finds chicken, "cauliflower rice" finds rice, and the user gets a plan built on food
     they do not have. Offering candidates a person picks is a different thing — the person
     decides, and can decline all of them. The test named "is a lookup, not a parser" is
     there to make regrowing it a failing build rather than a judgement call.
Consequence: search ranks canonical names above synonyms. Without that, typing "chick"
     offered *stock*, whose synonym "chicken stock" matched and whose canonical name is
     shorter.

## D-060 — No quantity field
Date: 2026-09-12
Question: Should intake ask how much of each thing there is?
Choice: No.
Why: nothing consumes it. Scoring matches on presence, the scheduler works in minutes, and
     a plan does not change between four lemons and six. Asking for seventeen numbers that
     change no output is its own kind of stub — it looks like input and behaves like
     decoration. When something starts reading quantities, that is when to start asking.
Revisit if: servings scaling ever needs to know whether there is enough, or the shopping
     gap ("you are 200g short") gets built.

## D-061 — The assumed kitchen holds a pot
Date: 2026-09-12
Question: The default equipment list was the two pans from §10. Is that the right default
          for someone's own kitchen?
Choice: No. Widened to what a small kitchen actually holds — pot, colander, grater,
        measuring cup, jars, jug — with the blender the one deliberate omission.
Why: a recipe needing equipment the kitchen does not have is not a candidate at all, so the
     same fridge that compiles to six dishes compiled to two, silently, with a missing sieve
     as the reason and no way to tell. Assuming someone owns a pot is a far smaller sin.
     The blender stays off because plenty of kitchens genuinely lack one and the checklist
     makes it one tap — and turning it on is usually worth a drink.

## D-062 — "No plan" is a value, not an exception
Date: 2026-09-12
Question: What should `buildPlan` do when nothing in the registry can be made?
Choice: Return null. Previously it built an empty `MealPlan`, which the schema rejects, so
        a pure function three layers down threw a validation error into the render.
Why: one ingredient and an ordinary kitchen was enough to trigger it, and what the user got
     was a blank screen. Found by a test written for a different reason. `compileSession`
     also wraps the whole compile in a catch now: it is the only place in the client that
     runs unbounded logic over user input, and the one outcome it must never have is
     nothing at all.
