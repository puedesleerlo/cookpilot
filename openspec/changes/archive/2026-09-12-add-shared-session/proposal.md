## Why

A session is compiled for two cooks and shown on one screen. In a kitchen that means one
person reads the run sheet aloud and the other asks "which one is mine?" — the timeline
knows exactly who does what and when, and none of that reaches the second pair of hands.

This change puts the session on every phone in the kitchen: scan a code, say which cook you
are and what to call you, and when the host says go, each phone shows its owner one step, a
countdown, and what comes next.

## What Changes

- Open a shared session from a compiled timeline. The host's screen shows a QR code and a
  six-letter code; both lead to the same session.
- Join from a phone: pick which cook in the compiled crew you are, give a name, wait in a
  lobby that fills in as people arrive.
- Sync the inputs and the ordered log, never the schedule. Every device compiles its own
  timeline from the same inputs and checks the result's hash against the host's, so
  agreement is verified rather than assumed.
- Starting is the host's call, enabled the moment the last cook is in, with a way to start
  short-handed.
- Story mode: one slide per cook — the current step, a countdown to when the compiler
  expected it done, a Done button sized for wet hands, and the next step underneath. A
  screen nobody claimed shows everyone's slide at once. Whatever is looking after itself on
  the stove is listed with its own timer on every device.
- Every countdown is anchored to the server clock, re-measured on every response, so two
  phones count down together.
- A finished step is an event in the log. It shows on the phone that tapped it immediately
  and on every other device on its next poll.

The deterministic primary path is the whole path: the scheduler compiles identically on
every device, and the log is folded identically on every device. No model is involved.

## Capabilities

### New Capabilities
- `shared-session`: opening, joining, starting and cooking a session across several
  devices, and what each device shows while it does.

### Modified Capabilities
- None. `persistence` gains three nullable-or-defaulted columns on `sessions` (the crew,
  the host's schedule hash, the start time) under a migration that the previous version of
  the application tolerates; no requirement in that spec changes.

## Impact

- `packages/contracts` gains the session wire shapes and six routes.
- `apps/api` gains `src/sessions/routes.ts`, a transactional cook claim in `db/sessions.ts`,
  and migration `0001_add-shared-session`.
- `apps/web` gains `app/{api,sync,story}.ts`, `ui/cooking/*` and `ui/screens/Shared.tsx`;
  the timeline gets a "Cook this together" button, the landing a "Join" link, and `#join`
  becomes a route. The Vite dev server listens on the network so a phone can load it.
- The single-device flow is untouched: the example session still compiles with the API
  origin blocked. Only the shared session needs the API, which is what the API is for.
