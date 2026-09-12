## 1. The event

- [x] 1.1 `task-started` in the contract's event vocabulary and append request.
- [x] 1.2 The API stamps it with the server's clock; tested on both backends.

## 2. The model

- [x] 2.1 `windowOf`: the plan's minutes, or the tap plus the step's duration.
- [x] 2.2 `slideFor` prefers the most recent by-hand start; `statusOf` for paging.
- [x] 2.3 `sessionProgress` and `dishProgress`; `startedFrom` and `startsSince` for the log.
- [x] 2.4 The store folds starts, with `startNow` optimistic like `complete`.

## 3. The slide

- [x] 3.1 Previous, next, "Now"; a paged slide stays, a following slide follows.
- [x] 3.2 The action pinned to the bottom on a phone; Done, "Start it now", "Mark done", "Back to now".
- [x] 3.3 Two bars: whole session, and the dish of the step in view.

## 4. Verify

- [x] 4.1 Story arithmetic for by-hand starts, statuses and progress.
- [x] 4.2 The store against the fake server: optimistic start, refusal, another cook's start.
- [x] 4.3 Screens: paging, the pinned action, the two bars, starting from a wait.
- [x] 4.4 `pnpm typecheck`, `pnpm lint`, `pnpm test`, both scanners; `openspec validate --strict`.

## 5. Close out

- [x] 5.1 Archive; commit.
