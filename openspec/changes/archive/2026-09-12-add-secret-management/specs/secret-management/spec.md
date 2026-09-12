## ADDED Requirements

### Requirement: Secrets are declared once, in an inventory

The system SHALL declare every secret in one inventory recording its name, which services
may read it, whether it is required, and where it comes from.

A committed `.env.example` SHALL list every name with no values. A `.env` file SHALL be
gitignored.

#### Scenario: The inventory and the example file agree
- **WHEN** the test suite compares the declared inventory with `.env.example`
- **THEN** every inventory entry appears in the example file and no extra name appears there

#### Scenario: Real values are never committed
- **WHEN** the repository is scanned
- **THEN** no `.env` file is tracked, and `.env` is listed in `.gitignore`

#### Scenario: The model provider contributes no secret
- **WHEN** the inventory is filtered to the model provider
- **THEN** it holds no entry, because Vertex authenticates through the service account

### Requirement: Secrets are read by version alias, never `latest`

Where a secret is loaded from Google Secret Manager, the reference SHALL name an explicit
version or a pinned alias. The system SHALL NOT resolve `latest`.

#### Scenario: A pinned version is accepted
- **WHEN** a secret is configured as `projects/p/secrets/BRAVE_API_KEY/versions/7`
- **THEN** it loads

#### Scenario: `latest` is rejected
- **WHEN** a secret reference ends in `/versions/latest`
- **THEN** startup fails with an error explaining that rotation must be a deliberate deploy

### Requirement: A missing required secret fails at startup

The system SHALL validate every required secret when a service starts, and SHALL exit
non-zero naming each missing secret and where it should have come from.

A service SHALL NOT start in a state where a request will fail later for want of a secret.

#### Scenario: Startup names what is missing
- **WHEN** the API starts with `BRAVE_API_KEY` unset
- **THEN** it exits non-zero and the message names `BRAVE_API_KEY` and the two places it can come from

#### Scenario: An optional secret does not block startup
- **WHEN** an optional secret is absent
- **THEN** the service starts and the feature that needs it reports itself unavailable

#### Scenario: Failure is not deferred to the first request
- **WHEN** a required secret is absent
- **THEN** no HTTP listener is opened

### Requirement: Each service reads only the secrets it needs

Every service SHALL declare which secrets it requires, and SHALL be granted access to
those and no others.

#### Scenario: The worker cannot read the voice key
- **WHEN** the worker's declared secret set is inspected
- **THEN** it does not include `ELEVENLABS_API_KEY`

#### Scenario: A service reading outside its set is a failure
- **WHEN** a service requests a secret it did not declare
- **THEN** the loader throws, naming the secret and the service

#### Scenario: The IAM bindings match the declarations
- **WHEN** the generated IAM script is compared with the per-service declarations
- **THEN** each service account is granted `secretAccessor` on exactly its declared secrets

### Requirement: Secrets never reach logs

The logger SHALL redact values matching known secret shapes, and SHALL redact the value of
any configured secret, regardless of the key it is logged under.

#### Scenario: A key logged by accident is redacted
- **WHEN** an object containing a live secret value is logged
- **THEN** the emitted line shows a redaction marker and not the value

#### Scenario: Redaction is by shape, not by field name
- **WHEN** a secret value appears inside a free-text message under an innocuous key
- **THEN** it is still redacted

### Requirement: Secrets cannot reach the repository or the client bundle

CI SHALL scan the working tree for secret values and shapes, and SHALL scan the built
client bundle for secret names and value shapes. Either finding SHALL fail the build.

#### Scenario: A committed key fails CI
- **WHEN** a file in the working tree contains a value matching a known key shape
- **THEN** the secret scan exits non-zero and names the file and the shape, without printing the value

#### Scenario: A key in the client bundle fails CI
- **WHEN** the built client bundle contains a provider secret name or a key-shaped value
- **THEN** the bundle scan exits non-zero

#### Scenario: The scanner does not print what it found
- **WHEN** the scanner reports a finding
- **THEN** the output names the file and the shape but not the matched value

### Requirement: One module per provider

Each external provider SHALL be reached through exactly one module, and that module SHALL
be the only place its credential is read.

#### Scenario: A credential has one reader
- **WHEN** the repository is scanned for reads of `BRAVE_API_KEY`
- **THEN** exactly one module reads it

#### Scenario: The client requests a token rather than holding a key
- **WHEN** the web client needs a voice session
- **THEN** it requests a short-lived token from the API, and no provider key exists in the client
