## Why

This lands before any provider integration, on purpose. Every leaked key in history was
committed while the plumbing was "temporary" — someone hardcodes a value to get a call
working, means to move it, and ships. Building the loading path first means there is never
a moment where hardcoding is the path of least resistance.

There is a second reason it is cheap to do now: Vertex authenticates through the service
account, so the model provider contributes **no secret at all**. The inventory is two
provider keys, not three, and it is easier to hold that line from the start than to remove
a key later.

## What Changes

- Add a secret loader that reads from Google Secret Manager in Cloud Run and from a
  gitignored `.env` locally, behind one interface, with a committed `.env.example` listing
  every name and no values.
- Require secrets by **version alias, not `latest`**, so rotation is a deliberate deploy
  rather than a surprise at 2am when someone adds a version.
- Fail fast and loudly at startup on a missing required secret, naming which one and where
  it should come from — never at the first request, half a call into a user's session.
- Give each provider exactly one module (`brave.ts`, `elevenlabs.ts`, `vertex.ts`), so a
  leaked key has one place to be rotated and one place to be audited.
- Scope access per service: the worker has no reason to read `ELEVENLABS_API_KEY`, and the
  IAM bindings say so. Document the bindings as runnable `gcloud` commands.
- Add CI secret scanning over the repository history and the working tree, plus the client
  bundle scan added with the workspace.
- Never log a secret: redact by value shape at the logger, not by remembering to.

## Capabilities

### New Capabilities
- `secret-management`: the secret inventory, how each one is loaded and scoped, what
  happens when one is missing, and the checks that stop one reaching the repository, the
  logs or the client bundle.

## Impact

- Creates `apps/api/src/config/`, `apps/api/src/providers/`, `.env.example`,
  `scripts/scan-secrets.mjs`, `infra/iam.sh`, `.github/workflows/ci.yml`.
- No runtime behaviour yet: no provider is called until its own change.
