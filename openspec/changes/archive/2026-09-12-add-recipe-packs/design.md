## Context

Downstream, the task-graph compiler turns a recipe into a DAG of atomic tasks with
equipment, dependencies and safety annotations. It can only do that if the recipe already
says how long each step takes, how much of that is hands-on, what it occupies while it
runs, and what it waits on. Prose says none of that.

So the question this change answers is: what is the smallest structure a recipe must carry
for a scheduler to be able to compile it — and where does that structure come from when
there is no API key.

## Goals / Non-Goals

**Goals:**
- A `RecipeIR` that is sufficient for §7's step expansion with no further inference.
- Seed content rich enough that the demo scenario compiles offline, with real beverages.
- An LLM boundary that fails safe: schema, one repair, then determinism.
- Pack identity that is content-addressed, so two copies of the same pack are the same pack.

**Non-Goals:**
- Fetching URLs from the browser. CORS makes that unreliable and it is not worth a proxy;
  the user pastes text. Recorded as D-013.
- A recipe editor. Import, export and delete is the whole surface.
- Nutrition, scaling by ratio, or unit conversion beyond what scoring needs.

## Decisions

### The step is the unit of structure, and it carries its own phase budget

```
durationMin   ├──────────────────────────── 25 ────────────────────────────┤
activeMin     ├─ 1 ─┤                                                       
finishMin                                                          ├─ 1 ─┤
passive             ├──────────────── 23 ─────────────────┤
```

`passiveMin = durationMin - activeMin - finishMin`, and the schema rejects a negative
remainder. §7's expansion reads straight off this, emitting a phase only where there is
time in it: START where `activeMin > 0`, HOLD where the passive remainder is positive,
FINISH where `finishMin > 0`. A fully attended sear expands to a single START; a rest
expands to a single HOLD that needs nobody, which is exactly right — the previous step's
FINISH already set the food down.

`heldThroughHold` on each equipment requirement decides what the HOLD phase keeps. The
saucepan is held while rice cooks; the knife that chopped the aromatics is not held while
they marinate. Without this flag every long passive step would lock the whole kitchen.

### Dependencies are declared per step, in both directions of time

`dependsOn` gives the graph its edges. `minDelayAfterMin` carries quality (rest the fish);
`maxDelayAfterMin` carries safety and quality alike (chill within 120, serve within 10).
The same field shape expresses both because the scheduler treats them the same way — as a
window the start time must land inside.

### Pack identity is a content hash, and a mismatch is a warning

`contentHash` is FNV-1a over a canonical JSON serialisation with sorted keys, so key order
and whitespace cannot change identity. On load a mismatch produces a warning rather than a
rejection: a user who hand-edits an exported pack should get their edit and a note, not a
dead file. Seed packs are stamped by `scripts/stamp-packs.mjs` and a test asserts they are
current, so drift is caught in CI rather than at runtime.

### The LLM client: schema in, validated data out, determinism behind it

```
  callStage(spec, input)
        │
        ├─ no API key ──────────────────────────────────► fallback(input)
        │
        ├─ build request: system + user, output_config.format = toJSONSchema(spec.schema)
        │      model claude-opus-5, adaptive thinking, per-stage effort, abort on timeout
        │
        ├─ parse + spec.schema.safeParse
        │      ├─ ok ──────────────────────────────────► result, source: 'model'
        │      └─ fail ─► one repair call quoting the issues
        │                    ├─ ok ────────────────────► result, source: 'repaired'
        │                    └─ fail ──────────────────► fallback(input), source: 'fallback'
        │
        └─ any throw / timeout ────────────────────────► fallback(input), source: 'fallback'
```

Every stage declares `{ name, schema, system, buildUser, fallback, effort }`. The client
owns everything else. That means "works with no API key" is a property of the client, not a
discipline each stage has to remember — a stage physically cannot skip its fallback,
because the client is what calls the model, not the stage.

Structured outputs (`output_config.format`) do most of the work that a repair loop would
otherwise do; the repair pass exists for the residual, and for the case where the model
returns something schema-valid but semantically empty.

**Model choice:** `claude-opus-5`, with `effort` set per stage — `low` for extraction
(L1, L2, L5), `medium` for the two stages that genuinely reason about structure (L3, L4).

### The deterministic fallback is a cooking-verb rule table

One table, keyed on verb, giving duration, the active/passive split, equipment, task class,
minimum skill and effort. `simmer` is mostly passive and holds a burner; `chop` is fully
active and holds a board; `steep` is almost entirely passive and holds a jar.

This table is the reason the product works with no key at all. It is also what L4 falls back
to in a later change, so it is written once here and shared.

### Seed packs

Five, by role, so the planner can compose a session rather than pick one recipe:

| Pack | Role |
|---|---|
| `seed-asian-weeknight` | Mains built on the demo pantry |
| `seed-bases` | Grains, eggs, blanched greens — long passive windows, high reuse |
| `seed-sauces` | Ambient, no burner contention, ideal beginner work |
| `seed-beverages` | Batch drinks, including a 12-hour cold brew |
| `seed-fast-mains` | Short mains for the degradation ladder's substitution rung |

`seed-fast-mains` exists specifically so rung 3 of the ladder has somewhere to go. A
substitution rung with nothing shorter to substitute is a no-op.

## Risks / Trade-offs

- **Hand-authored seed durations are estimates.** They are internally consistent and
  plausible, which is what a schedule needs; they are not measured. Cooking mode's
  "running late" event exists partly to absorb this.
- **`z.toJSONSchema` and the API's structured-output dialect may disagree** on some Zod
  constructs. Mitigated by keeping stage schemas to plain objects, arrays, enums and
  primitives, and by the repair pass and fallback behind it.
- **The key is bundled.** `VITE_ANTHROPIC_API_KEY` is inlined into the client bundle at
  build time. That is acceptable for a local demo and unacceptable for a deployment, so the
  app says so in the debug panel rather than implying the key is safe. Recorded as D-014.
- **FNV-1a is not cryptographic.** It is used for identity and cache keys, never for trust.
  The field is named `contentHash` and prefixed `fnv1a-` so nobody mistakes it for one.
