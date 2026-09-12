# monorepo-architecture Specification

## Purpose
TBD - created by archiving change add-monorepo-and-shared-domain. Update Purpose after archive.
## Requirements
### Requirement: The workspace has one scheduler, compiled into both runtimes

The system SHALL define the scheduling engine exactly once, in `packages/scheduler`, and
SHALL compile that same package into both the API service and the web client.

No second implementation, port or re-derivation of scheduling logic SHALL exist.

#### Scenario: Both runtimes depend on the same package
- **WHEN** the dependency graphs of `apps/api` and `apps/web` are inspected
- **THEN** both resolve `@kitchen/scheduler` to the same workspace package

#### Scenario: A client and the server agree on a schedule
- **WHEN** the same inputs and the same ordered event log are given to the browser copy and the API copy
- **THEN** both produce byte-identical schedules

#### Scenario: No duplicate implementation exists
- **WHEN** the repository is scanned for scheduling entry points outside `packages/scheduler`
- **THEN** none are found

### Requirement: Package dependencies flow one way

Packages SHALL depend only downward: `domain` depends on nothing; `scheduler`,
`contracts` and `recipes` depend on `domain`; applications depend on packages.

No package SHALL depend on an application, and no application SHALL depend on another
application.

#### Scenario: The domain package is a leaf
- **WHEN** `packages/domain` imports from any other workspace package
- **THEN** `pnpm lint` fails naming the forbidden import

#### Scenario: An application is never a dependency
- **WHEN** any package or application imports from `apps/api`, `apps/web` or `apps/worker`
- **THEN** `pnpm lint` fails

#### Scenario: The scheduler depends on the domain alone
- **WHEN** `packages/scheduler` imports `@kitchen/recipes` or `@kitchen/contracts`
- **THEN** `pnpm lint` fails

### Requirement: The scheduler package stays pure

Files in `packages/scheduler` SHALL NOT reference `Date.now`, `new Date()`,
`Math.random`, `fetch`, `crypto`, `performance`, `localStorage`, `indexedDB` or any Node
built-in. Current time SHALL be a parameter and randomness SHALL come from a seeded
generator.

#### Scenario: An ambient clock read fails the build
- **WHEN** a file in `packages/scheduler` calls `Date.now()`
- **THEN** `pnpm lint` fails, telling the author to pass time as a parameter

#### Scenario: A Node built-in fails the build
- **WHEN** a file in `packages/scheduler` imports `node:fs`
- **THEN** `pnpm lint` fails, because the package must also run in a browser

### Requirement: Server-only code cannot reach the client bundle

The web application SHALL NOT import from `apps/api` or `apps/worker`, and SHALL NOT
import any package that reaches a model provider, a database or a queue.

The built client bundle SHALL be scanned for provider secret names, and a build containing
one SHALL fail.

#### Scenario: The web app cannot import the API
- **WHEN** a file in `apps/web` imports from `apps/api`
- **THEN** `pnpm lint` fails

#### Scenario: A secret in the bundle fails CI
- **WHEN** the built client bundle contains the text of any provider secret name
- **THEN** the build step exits non-zero and names the offending secret

#### Scenario: The web app talks to the API only over its contract
- **WHEN** the web application calls the backend
- **THEN** it does so through types exported from `@kitchen/contracts`

### Requirement: The offline demo path keeps working

The web application SHALL be able to run the demo scenario end to end — intake, plan
selection, a compiled timeline and cooking mode — with the API unreachable, using bundled
seed packs and the browser copy of the scheduler.

#### Scenario: The demo survives a blocked API
- **WHEN** the API origin is blocked and the demo scenario is started
- **THEN** a schedule is compiled and rendered in the browser without any network request succeeding

#### Scenario: Seed packs are bundled, not fetched
- **WHEN** the web application loads with no network
- **THEN** the seed recipe packs are available from the bundle

### Requirement: One command builds, tests and checks the whole workspace

The repository SHALL expose workspace-level `build`, `test`, `lint` and `typecheck`
commands that cover every package and application.

#### Scenario: A single test command covers the workspace
- **WHEN** `pnpm test` is run at the root
- **THEN** every package's and application's tests run, and a failure anywhere fails the command

#### Scenario: Type checking spans package boundaries
- **WHEN** a type exported by `packages/domain` is changed incompatibly
- **THEN** `pnpm typecheck` fails in the consuming package, not only in `domain`

