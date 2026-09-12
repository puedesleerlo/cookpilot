## Why

This is the product. Everything built so far exists to feed it, and everything after it
exists to show what it produced.

The claim it has to make good on: given a fridge, a clock, some cooks and two pans, find
the ordering that gets everything out of the kitchen — and be right about food safety while
doing it, because a schedule that puts salad on the board the chicken was just on is worse
than no schedule.

## What Changes

- Build the critical-path pass: earliest and latest start for every task, slack, and the
  path where slipping a minute costs a minute at the end.
- Schedule under real resource limits with a serial generation scheme: two burners is two
  burners, one pan is one pan, and cold storage has shelves.
- Assign cooks by eligibility and skill, then improve the assignment with a bounded local
  search that only accepts a swap if the finish time does not get worse and the split gets
  fairer.
- Insert washes where the contamination model demands them. A raw-meat surface reaching
  food that will not be cooked is forbidden, not discouraged.
- Climb the degradation ladder when the session does not fit, one rung at a time, stopping
  as soon as it does — and say what was given up and why.
- Emit the reasons as structured facts the engine already knows, so the explanation cannot
  disagree with the schedule.
- Keep the whole thing a pure function: same input, byte-identical output, every time.

## Capabilities

### New Capabilities
- `scheduling`: the engine — critical path, resource-constrained ordering, cook assignment,
  the contamination rules, the degradation ladder, and the guarantees the output carries.

## Impact

- Fills `packages/scheduler`, which compiles into both the API and the browser.
- Makes the demo scenario compilable end to end for the first time.
