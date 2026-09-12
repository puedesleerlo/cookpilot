## ADDED Requirements

### Requirement: Identity is a device, and it is anonymous

The system SHALL issue an identity to a device without collecting an email address, a
password, or any personal information.

A device token SHALL identify a device and SHALL carry no personal data.

#### Scenario: A device gets an identity with no account
- **WHEN** a client calls `POST /v1/devices` with an empty body
- **THEN** it receives a device id and a signed token, and no personal data was requested

#### Scenario: The token carries nothing personal
- **WHEN** a device token is decoded
- **THEN** its claims contain a device id, an issue time and an expiry, and nothing else

### Requirement: Only a hash of the token is stored

The system SHALL store a cryptographic hash of each device token and SHALL NOT store the
token itself.

#### Scenario: A database dump is not a set of credentials
- **WHEN** the devices table is read
- **THEN** no column contains a value that can be presented as a token

#### Scenario: The stored hash still verifies the right device
- **WHEN** a valid token is presented
- **THEN** it resolves to the device whose stored hash matches, and to no other

### Requirement: Verification fails closed

A request presenting a missing, malformed, expired, or wrongly-signed token SHALL be
rejected with 401. A token for a device that no longer exists SHALL also be rejected.

#### Scenario: A forged signature is rejected
- **WHEN** a token signed with a different key is presented
- **THEN** the response is 401 with code `unauthorized`

#### Scenario: An expired token is rejected
- **WHEN** a token past its expiry is presented
- **THEN** the response is 401

#### Scenario: A revoked device is rejected
- **WHEN** a token is presented for a device whose row has been deleted
- **THEN** the response is 401, not 200

#### Scenario: A missing token on a protected route is rejected
- **WHEN** a protected route is called with no authorization header
- **THEN** the response is 401 and the handler never runs

#### Scenario: Unprotected routes stay reachable
- **WHEN** `GET /v1/time` is called with no token
- **THEN** it returns 200

### Requirement: Authorization distinguishes a member from the host

The system SHALL provide checks for whether a device is a member of a session and whether
it is that session's host.

Structural changes to a session SHALL be restricted to the host; task events SHALL be
available to any member.

#### Scenario: A non-member is refused
- **WHEN** a device that has not joined a session acts on it
- **THEN** the response is 403 with code `forbidden`

#### Scenario: A member may act on tasks
- **WHEN** a member device emits a task event
- **THEN** it is accepted

#### Scenario: Only the host may change constraints
- **WHEN** a member who is not the host attempts a constraint change
- **THEN** the response is 403, and the session's constraints are unchanged

#### Scenario: Authorization is enforced in the API, not the interface
- **WHEN** the restriction is tested by calling the API directly, bypassing any client
- **THEN** it still holds

### Requirement: Device creation is rate limited more tightly than ordinary requests

The system SHALL rate limit requests per device, and SHALL apply a stricter limit to device
creation than to authenticated requests.

Exceeding a limit SHALL return 429 with code `rate_limited` and a `retry-after` header.

#### Scenario: Farming tokens is throttled
- **WHEN** one client creates devices repeatedly beyond the creation limit
- **THEN** further creations return 429 with a `retry-after` header

#### Scenario: Ordinary use is not throttled
- **WHEN** a device makes a normal number of authenticated requests during a cooking session
- **THEN** none are rate limited

#### Scenario: One device's limit does not affect another
- **WHEN** one device exhausts its limit
- **THEN** a different device's requests still succeed
