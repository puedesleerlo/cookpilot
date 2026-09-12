## 1. Tokens

- [x] 1.1 Add `apps/api/src/auth/devices.ts`: issue a signed anonymous token whose claims are a device id and timestamps.
- [x] 1.2 Store only a SHA-256 hash of the token.
- [x] 1.3 Verify failing closed on missing, malformed, expired, wrongly-signed, and revoked-device tokens.
- [x] 1.4 Return an identical message for expired and forged, so a prober learns nothing.

## 2. Authorization

- [x] 2.1 Add `isMember` / `isHost` and their `require*` counterparts.
- [x] 2.2 Enforce in the authorization layer, reachable without an interface.

## 3. Routes and wiring

- [x] 3.1 Add `POST /v1/devices` and `GET /v1/devices/me` to the contract and the server.
- [x] 3.2 Add a `requireDevice` decorator so a route declares its need rather than remembering to check.
- [x] 3.3 Register rate limiting keyed on device, falling back to address.
- [x] 3.4 Apply a tighter hourly limit to device creation than the global per-minute limit.
- [x] 3.5 Teach the error handler to recognise a plugin-thrown envelope, so a throttle is a 429 rather than a 500.

## 4. Tests

- [x] 4.1 Anonymity: no personal data requested, none in the claims.
- [x] 4.2 Storage: the stored value is not the token and cannot be presented as one.
- [x] 4.3 Fails closed on every rejection path, including a revoked device whose token still verifies.
- [x] 4.4 Member vs host, including the direct-API check that bypasses any client.
- [x] 4.5 Creation is throttled with a `retry-after`; an ordinary session's traffic is not.

## 5. Close out

- [x] 5.1 `pnpm check` clean.
- [x] 5.2 `openspec validate add-device-identity --strict` clean.
- [x] 5.3 Log decisions; archive; commit.
