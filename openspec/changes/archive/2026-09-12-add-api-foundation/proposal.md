## Why

Everything server-side lands on this: sessions, the event log, the LLM gateway, discovery,
the WebSocket. Getting the shape right once — how config is read, how errors are reported,
what a log line contains, how the client knows what a route accepts — is much cheaper than
retrofitting it across a dozen routes later.

Two decisions here are not cosmetic. The first is that the wire contract lives in
`packages/contracts` rather than in either side, so the client cannot drift from the server
by editing its own copy of a type. The second is `GET /v1/time`: two phones running
countdown timers off their own clocks will disagree within a session, and a timeline
nobody trusts is worse than no timeline.

## What Changes

- Stand up `apps/api` on Fastify with a typed config module that fails at startup on a bad
  value, not at the first request that reads one.
- Define the wire contract in `packages/contracts` as Zod schemas, and derive both the
  server's validation and the client's types from them.
- Add a single error model: every failure is `{ error: { code, message, requestId } }`,
  with a stable machine-readable `code`. Unexpected failures never leak an internal
  message or a stack to the client.
- Add structured logging through pino, with the redaction from `add-secret-management`
  wired in at the serialiser, so a secret cannot reach a log line by being passed to one.
- Add `GET /healthz` (liveness, no dependencies) and `GET /readyz` (readiness, which does
  check dependencies), so Cloud Run can tell "starting" from "broken".
- Add `GET /v1/time`, the clock every client timer anchors to.
- Generate an OpenAPI document from the contract schemas, so the description of the API
  cannot drift from the API.
- Add a request id on every request and response, so a user-visible error and a log line
  can be joined.

## Capabilities

### New Capabilities
- `api-foundation`: the server's shape — config, the wire contract, the error model,
  logging, health and readiness, server time, and request correlation.

## Impact

- Creates `apps/api/src/{server,config,routes,errors,logging}`, fills `packages/contracts`.
- No product behaviour yet; this is the surface later changes hang routes on.
