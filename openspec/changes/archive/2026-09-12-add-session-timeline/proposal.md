## Why

The engine has been able to compile the §10 session for a while and nobody could see it.
The landing page made a claim and the next screen said "this part is still on the stove" —
which was honest, and useless. The whole product is one picture: two cooks, two burners, and
an hour of work laid over each other until it fits.

This change makes that picture, and makes it real rather than illustrative: it is drawn from
a schedule compiled in the browser, from the pantry, at the moment you ask for it.

## What Changes

- Compile in the client. The recipe registry is bundled and the plan builder and scheduler
  are pure, so the example session needs no network, no account and no key.
- Draw the schedule as a Gantt of real resources — one row per cook and per thing there is
  only one of — scaled so the attended session always fits the width without scrolling.
- Mark what the chart means: passive work hatched, the critical path stroked, washes in
  their own colour, and a line where the last pair of hands comes free.
- Offer the same schedule as a run sheet, for following rather than admiring.
- Open any block for what the compiler decided about it: when, who, what it holds, how much
  it can slip, and the rationale it was named in.
- List what happens tomorrow morning separately, because a cold brew that steeps for twelve
  hours is not part of tonight's hour.
- Recompile live when the time, the crew, the servings or the drinks change. Taking half the
  hour away rebuilds the plan and redraws the chart in a few milliseconds.
- Reach the compiled session directly at `#demo`.

## Capabilities

### New Capabilities
- `session-timeline`: how a compiled session is shown — the chart, the run sheet, the task
  detail, the overnight list, and the recompilation loop.

### Modified Capabilities
- `scheduling`: lanes are derived from the resource slots a task was actually given, and the
  urgency metric counts urgent ingredients rather than every ingredient in the plan.

## Impact

- Fills `apps/web/src/ui/timeline` and `apps/web/src/app/{compile,constraints}.ts`.
- `packages/recipes` gains a dependency on `@kitchen/scheduler`, so the plan builder can
  compile a candidate plan rather than estimate it.
- The deployed client stops being a landing page with nothing behind it.
