# api-foundation Specification

## Purpose
TBD - created by archiving change add-api-foundation. Update Purpose after archive.
## Requirements
### Requirement: The wire contract is shared, not duplicated

Every request and response shape SHALL be defined once, as a Zod schema in
`packages/contracts`, and both the server's runtime validation and the client's types
SHALL derive from that definition.

Neither `apps/api` nor `apps/web` SHALL declare its own copy of a wire shape.

#### Scenario: One definition, two consumers
- **WHEN** a response field is renamed in `packages/contracts`
- **THEN** `pnpm typecheck` fails in both `apps/api` and `apps/web` until each is updated

#### Scenario: The server validates against the shared schema
- **WHEN** a request body fails the contract schema
- **THEN** the server responds 400 with a validation error naming the offending field, and the handler never runs

#### Scenario: The client cannot invent a shape
- **WHEN** the web client calls an endpoint
- **THEN** its request and response types come from `@kitchen/contracts`

### Requirement: Configuration is validated at startup

The server SHALL parse and validate its entire configuration before opening a listener,
and SHALL exit non-zero naming every invalid or missing value.

#### Scenario: A bad value stops the process
- **WHEN** `PORT` is set to a non-numeric value
- **THEN** the process exits non-zero naming `PORT`, and no listener is opened

#### Scenario: Defaults are explicit
- **WHEN** an optional setting is absent
- **THEN** the documented default is used and is visible in the startup log

### Requirement: One error model, with stable codes

Every error response SHALL have the shape
`{ error: { code, message, requestId, details? } }`, where `code` is a stable
machine-readable identifier.

Unexpected failures SHALL return a generic message and SHALL NOT expose an internal
message, a stack trace, or a database error to the client.

#### Scenario: A known failure is identifiable without parsing prose
- **WHEN** a client requests a session that does not exist
- **THEN** the response is 404 with `code` of `session_not_found`

#### Scenario: An unexpected failure does not leak internals
- **WHEN** a handler throws an unexpected error
- **THEN** the response is 500 with a generic message and a request id, and the stack appears only in the server log

#### Scenario: Validation failures name the field
- **WHEN** a request body is missing a required field
- **THEN** the response is 400 with `code` of `invalid_request` and `details` naming the field path

### Requirement: Every request is correlatable

The server SHALL attach a request id to every request, return it in a response header and
in any error body, and include it on every log line for that request.

#### Scenario: A user-visible error can be found in the logs
- **WHEN** a client reports an error showing a request id
- **THEN** every log line for that request can be retrieved by that id

#### Scenario: A caller-supplied id is honoured
- **WHEN** a request arrives with an `x-request-id` header
- **THEN** that value is used rather than a generated one

### Requirement: Logs never contain secrets

The logger SHALL pass every logged value through the redaction from the secret-management
capability before serialisation.

#### Scenario: A secret passed to the logger is redacted
- **WHEN** an object containing a configured secret value is logged
- **THEN** the emitted line contains a redaction marker and not the value

#### Scenario: Authorization headers are not logged verbatim
- **WHEN** a request carrying an `authorization` header is logged
- **THEN** the header value is redacted

### Requirement: Liveness and readiness are distinguishable

The server SHALL expose `GET /healthz`, which depends on nothing and reports that the
process is running, and `GET /readyz`, which checks its dependencies and reports whether
the instance can serve traffic.

#### Scenario: Liveness does not depend on the database
- **WHEN** the database is unreachable
- **THEN** `GET /healthz` still returns 200

#### Scenario: Readiness fails when a dependency is down
- **WHEN** the database is unreachable
- **THEN** `GET /readyz` returns 503 and names the failing dependency

#### Scenario: Readiness reports the scheduler version
- **WHEN** `GET /readyz` succeeds
- **THEN** the body includes the scheduler version the instance is running

### Requirement: The server publishes an authoritative clock

The server SHALL expose `GET /v1/time` returning its current time in milliseconds since
the epoch.

Clients SHALL anchor every countdown to the offset between that value and their own clock
rather than to their own clock alone.

#### Scenario: A client can compute its offset
- **WHEN** a client calls `GET /v1/time`
- **THEN** the response carries the server time in milliseconds and the client can derive a signed offset

#### Scenario: The clock route needs no authentication
- **WHEN** `GET /v1/time` is called with no credentials
- **THEN** it returns 200, because a client needs the offset before it has a device token

### Requirement: The API describes itself from the contract

The server SHALL generate an OpenAPI document from the contract schemas rather than from a
hand-written description.

#### Scenario: The description cannot drift
- **WHEN** a contract schema changes
- **THEN** the generated OpenAPI document reflects the change with no separate edit

#### Scenario: Every route is described
- **WHEN** the generated document is compared with the registered routes
- **THEN** every non-internal route appears in it

