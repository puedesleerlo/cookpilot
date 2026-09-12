## 1. Contract and storage

- [x] 1.1 Session wire shapes in `packages/contracts`: inputs, crew, members, events, views, six routes.
- [x] 1.2 The join-code alphabet moves to the contract so both sides validate against one string.
- [x] 1.3 `sessions` gains `crew`, `schedule_hash` and `started_at`; migration `0001_add-shared-session`.
- [x] 1.4 `claimCook` decides competing claims under the session row lock.

## 2. The API

- [x] 2.1 Open, look up by code, read, join, replay-since-seq, append.
- [x] 2.2 Host-only start, member-or-host completion, expiry on every route that loads a session.
- [x] 2.3 Every response carries the server's time.
- [x] 2.4 Integration tests against Postgres: collision retry, concurrent claims, one log order, access.
- [x] 2.5 Fix the two inherited type errors in `db/sessions.ts` and `server.ts` now that `apps/api` is typechecked.

## 3. The client

- [x] 3.1 `app/api.ts`: typed calls from the contract, device identity, clock offset, LAN-aware base URL.
- [x] 3.2 `app/story.ts`: steps per cook, the slide of the moment, holds in progress, the roster.
- [x] 3.3 `app/sync.ts`: host, look up, claim, start, complete (optimistic), poll, resume, leave.
- [x] 3.4 Screens: join, lobby with QR and roster, story slide, cooking view with a display mode, error.
- [x] 3.5 Wire in: `#join/CODE` route, "Cook this together" on the timeline, "Join" on the landing.
- [x] 3.6 Vite listens on the network so a phone can load the page from the laptop's address.

## 4. Verify

- [x] 4.1 Story arithmetic against the compiled example and hand-built steps.
- [x] 4.2 The store against a fake server: agreement, optimistic taps, clock skew, offline, resume.
- [x] 4.3 Screens against the compiled example: lobby, join, cooking, timeline to lobby and back.
- [x] 4.4 Design audit still clean: no colour literal, no emoji, no monospace voice in new screens.
- [x] 4.5 The real API driven as a laptop and two phones: open, look up with a matching hash, join, a refused duplicate claim, host-only start, done, replay-since-seq, a stranger refused.
- [ ] 4.6 Try it on an actual phone over the kitchen wifi (the browser extension was not connected in this session).

## 5. Close out

- [x] 5.1 `pnpm --filter @kitchen/api typecheck` clean; `pnpm lint` clean; `pnpm test` green (564). Root `pnpm typecheck` is red only on the parallel cook-pipeline change's `apps/web/src/app/cook.ts`.
- [x] 5.2 `openspec validate add-shared-session --strict` clean.
- [x] 5.3 Log decisions; document the phone flow in RUNNING.md.
- [x] 5.4 Archive; commit.
