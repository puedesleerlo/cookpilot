## ADDED Requirements

### Requirement: Nothing is deployed without passing the secret scan

The deploy SHALL run the client bundle scan before its first call that changes anything,
and SHALL abort without deploying if the scan fails.

#### Scenario: A failing scan stops the deploy
- **WHEN** the bundle contains a provider secret name or a key-shaped value
- **THEN** the deploy exits non-zero and no version is created

#### Scenario: The scan runs before any upload
- **WHEN** a deploy begins
- **THEN** the scan completes before any file is transmitted

### Requirement: Deployment needs no interactive login

The deploy SHALL authenticate through Application Default Credentials, so that it can run
unattended.

#### Scenario: A stale CLI session does not block a deploy
- **WHEN** the Firebase CLI's own session has expired but ADC is valid
- **THEN** the deploy succeeds

#### Scenario: A missing credential fails with an instruction
- **WHEN** no access token can be obtained
- **THEN** the deploy exits naming the command that fixes it

### Requirement: Unknown paths reach the application, not a 404

Every path that does not match a file SHALL serve the application shell, so a deep link
opens the app at that route.

#### Scenario: A deep link works
- **WHEN** a browser requests a client-side route directly
- **THEN** the response is 200 and carries the application shell

### Requirement: The shell is never cached and hashed assets always are

The application shell SHALL be served with a no-store cache directive. Content-hashed
assets SHALL be served immutable with a one-year maximum age.

Header rules SHALL be expressed so that they match on the request path, which is what the
CDN evaluates.

#### Scenario: A redeploy reaches users immediately
- **WHEN** a new version is released
- **THEN** the next request for any application route returns the new shell rather than a cached one

#### Scenario: Assets are cached for a year
- **WHEN** a content-hashed asset is requested
- **THEN** it is served with an immutable directive and a one-year maximum age

#### Scenario: A rule written against the resolved file does not silently miss
- **WHEN** the shell is served at a path other than its filename
- **THEN** it still receives the no-store directive

### Requirement: Static security headers are set

Every response SHALL carry `X-Content-Type-Options`, `Referrer-Policy` and
`X-Frame-Options`, and a `Permissions-Policy` granting only the microphone.

#### Scenario: The response carries the headers
- **WHEN** any path is requested
- **THEN** the response carries all four headers

#### Scenario: Only the microphone is permitted
- **WHEN** the permissions policy is read
- **THEN** geolocation, camera and payment are denied and the microphone is allowed for the document itself

### Requirement: A version carries its own configuration

Rewrites and headers SHALL be sent with each version rather than set on the site, so that
releasing an earlier version restores that version's configuration too.

#### Scenario: A rollback restores behaviour, not just files
- **WHEN** a previous version is re-released
- **THEN** the rewrites and headers in force are that version's own
