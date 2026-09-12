## 1. The wire contract

- [x] 1.1 Fill `packages/contracts/src`: error envelope, health, readiness, server time, and the route registry each entry is declared in.
- [x] 1.2 Add `describeRoute()` so a route declares its method, path, body, response and codes in one place.
- [x] 1.3 Test: the contract is the only definition; renaming a field breaks both consumers.

## 2. Config

- [x] 2.1 Add `apps/api/src/config/env.ts`: a Zod-validated config with explicit defaults.
- [x] 2.2 Exit non-zero naming every invalid value before any listener opens.
- [x] 2.3 Tests: a bad `PORT` exits; defaults are applied and reported.

## 3. Errors and correlation

- [x] 3.1 Add `apps/api/src/errors.ts`: `ApiError` with stable codes, plus the envelope serialiser.
- [x] 3.2 Attach a request id per request, honouring `x-request-id`; return it in the header and in error bodies.
- [x] 3.3 Map unexpected throws to a generic 500 that leaks nothing.
- [x] 3.4 Map contract validation failures to 400 `invalid_request` with the field path.
- [x] 3.5 Tests: known code, generic 500, validation detail, id echoed and generated.

## 4. Logging

- [x] 4.1 Add `apps/api/src/logging.ts`: pino with the redaction serialiser and per-request child loggers.
- [x] 4.2 Tests: a registered secret is redacted; an authorization header is redacted.

## 5. Routes

- [x] 5.1 `GET /healthz` — liveness, no dependencies.
- [x] 5.2 `GET /readyz` — readiness, checks registered dependencies, reports the scheduler version.
- [x] 5.3 `GET /v1/time` — the authoritative clock, unauthenticated.
- [x] 5.4 `GET /openapi.json` — generated from the contract.
- [x] 5.5 Tests: liveness survives a dead dependency, readiness does not; time is monotonic and parseable; every route appears in the document.

## 6. Close out

- [x] 6.1 `pnpm check` clean; the server starts and serves the four routes in a test harness.
- [x] 6.2 `openspec validate add-api-foundation --strict` clean.
- [x] 6.3 Log decisions; archive; commit.
