## Why

The first evening with story mode in a kitchen produced four requests in a row: the Done
button was sometimes below the fold; a cook waiting on a simmer wanted to get on with the
next step rather than watch a countdown; nobody could look back at what they had done or
ahead at what was coming; and "how far along are we" had no answer beyond a minute count.

## What Changes

- The action for the step in view is pinned to the bottom of a phone's slide, always on
  screen: Done for a step in progress, "Start it now" for one that has not begun.
- "Start it now" is a shared log event, `task-started`, stamped with the server's clock.
  The step's timer runs from that moment on every device. It moves the timer to when the
  work actually began; it does not shorten the work.
- Previous and next controls page through a cook's steps — done, in progress, or still to
  come — and a "Now" control returns to the live step. A slide left on the live step
  follows the clock; one paged away stays put.
- Two progress bars: the whole session, as attended steps finished over steps there are
  across every cook; and the dish of the step in view, the same way, filtered.

The deterministic primary path is unchanged: every number comes from the compiled
schedule and the folded log, and no model is involved.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `shared-session`: the log gains `task-started`; story mode gains paging, a pinned
  action, and progress.

## Impact

- `packages/contracts`: `task-started` in the event vocabulary and the append request.
- `apps/api/src/sessions/routes.ts`: stamps a start with the server's clock, as it does
  the session's start.
- `apps/web/src/app/{story,sync}.ts` and `ui/cooking/Story.tsx`. No new routes, no schema
  change: the log already carries any event type.
