## Why

The client needs to be reachable at a URL before anything else about it can be judged, and
a static SPA wants a CDN rather than a server. Firebase Hosting is that, on the project
that already exists.

This does not reintroduce what the consolidated delta removed. The delta struck Firebase as
a **backend** — Firestore for data, Functions for logic — because the architecture is Cloud
Run, Postgres and Redis, and that has not changed. Firebase Hosting serves static bytes and
holds no state, no data and no logic. The API stays on Cloud Run.

## What Changes

- Deploy `apps/web/dist` to Firebase Hosting on the existing project.
- Deploy through the **Hosting REST API using Application Default Credentials**, not the
  Firebase CLI's own session, so the same path works unattended in CI with no interactive
  login.
- Refuse to deploy a bundle that has not passed the secret scan. Publishing to a CDN is
  irreversible in the way that matters: a secret that reaches it has been published,
  whatever is deleted afterwards.
- Ship the hosting config **with each version** rather than configuring the site, so a
  rollback rolls the rewrites and headers back with the files.
- Rewrite unknown paths to the app shell, so a deep link is the app's router rather than
  a 404.
- Cache content-hashed assets forever and the app shell not at all.
- Set the security headers a static app should have, including a `Permissions-Policy` that
  allows the microphone and nothing else.

## Capabilities

### New Capabilities
- `web-hosting`: how the client reaches the web — what is deployed, what is refused, how
  caching and rewrites behave, and what a rollback restores.

## Impact

- Creates `scripts/deploy-hosting.mjs`, `firebase.json`, `.firebaserc`.
- Enables `firebase.googleapis.com` and `firebasehosting.googleapis.com` on the project,
  and adds Firebase to it.
- No change to the API, which is not yet deployed.
