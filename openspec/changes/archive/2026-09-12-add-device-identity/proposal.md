## Why

Two people cooking together need to be the same session on two phones, and neither of them
should have to make an account to do it. The product has no accounts by design — so
identity is a device, not a person, and it is anonymous.

That still has to be real identity rather than a client-supplied id, because the session
rules depend on it: any member may emit events about their own tasks, but only the host may
change the constraints. Two cooks fighting over the plan is a worse failure than either of
them being unable to. If a device could claim to be the host, that rule would be decorative.

## What Changes

- Add `POST /v1/devices`, issuing a signed, anonymous device token. No email, no password,
  no personal data — the token identifies a device and nothing else.
- Store only a **hash** of the token. A database dump must not be a set of working
  credentials.
- Add token verification as a Fastify decorator, so a route declares that it needs a device
  and gets a verified one, rather than each handler remembering to check.
- Add rate limiting keyed on device, with a tighter limit on device creation than on
  ordinary requests, so the cheap-to-issue token is not cheap to farm.
- Add the authorization primitives the session rules will use: is this device a member of
  this session, and is it the host.
- Make tokens long-lived but revocable by deleting the device row, and make an unknown or
  revoked device fail closed.

## Capabilities

### New Capabilities
- `device-identity`: anonymous device tokens, how they are issued, verified, stored and
  revoked, the rate limits around them, and the membership and host checks that session
  permissions are built on.

## Impact

- Adds `POST /v1/devices` and an authentication decorator to the API.
- Adds rate limiting to every route.
- No user-visible flow yet; the client starts using this in `add-session-service`.
