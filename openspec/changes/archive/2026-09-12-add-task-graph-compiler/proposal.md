## Why

A recipe step is not a schedulable unit. "Simmer the rice for 25 minutes" occupies a
saucepan for 25 minutes and a cook for 2, and a scheduler that cannot say that will find no
parallelism worth showing. Splitting every step into the part that needs hands and the part
that does not is the single idea the whole product rests on.

The other half is what recipes never contain. A session does not end when the food is
cooked — it ends when it is portioned, chilled and labelled, and cooked food has to reach
refrigeration within two hours. Those are real tasks with real durations competing for real
cold space, and if they are not in the graph the schedule is a lie about when you are done.

## What Changes

- Expand each `RecipeIR` step into up to three tasks: **START** (needs a cook and the
  equipment), **HOLD** (needs the equipment and nobody), **FINISH** (needs a cook again).
  A phase is emitted only where there is time in it.
- Carry equipment through the hold only where it is genuinely held: a saucepan is occupied
  while rice cooks, the knife that chopped the aromatics is not.
- Append the finishing tasks recipes leave out — portion, chill, label — per dish, with a
  `maxDelay` edge enforcing the two-hour chill window from the moment cooking ends.
- Annotate safety: which surfaces a step leaves contaminated, which steps are ready-to-eat
  and must not follow raw protein without a wash, and which have a hold limit.
- Treat an overnight recipe's long passive tail as running past the session, so a
  twelve-hour cold brew does not make the session twelve hours long.
- Validate the result is a DAG. A cycle is a compiler error naming the recipe that caused
  it, never a hang.

## Capabilities

### New Capabilities
- `task-graph`: turning a meal plan into the atomic task DAG the scheduler consumes —
  the phase split, dependency edges and their delay windows, the finishing tasks, and the
  safety annotations.

## Impact

- Creates `packages/scheduler/src/graph/`.
- Consumed by `add-scheduling-engine`; nothing user-visible yet.
