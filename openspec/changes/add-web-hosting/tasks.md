## 1. Hosting

- [x] 1.1 Enable `firebase.googleapis.com` and `firebasehosting.googleapis.com`; add Firebase to the project.
- [x] 1.2 Add `firebase.json` and `.firebaserc` for the CLI path.
- [x] 1.3 Add `scripts/deploy-hosting.mjs` using the REST API and ADC.

## 2. Safety

- [x] 2.1 Run the bundle scan before the first mutating call; abort on failure.
- [x] 2.2 Fail with the fixing command when no credential is available.
- [x] 2.3 Add `--dry-run` so the file set can be inspected without deploying.

## 3. Behaviour

- [x] 3.1 Rewrite unknown paths to the app shell.
- [x] 3.2 No-store on the shell, immutable on hashed assets, matched on the request path.
- [x] 3.3 Security headers, with a microphone-only permissions policy.
- [x] 3.4 Ship the config with the version so a rollback restores it.

## 4. Verify against the live site

- [x] 4.1 Root returns 200 with the app shell.
- [x] 4.2 A deep link returns 200, not 404.
- [x] 4.3 Shell is no-store; hashed assets and the font are immutable.
- [x] 4.4 Security headers present; permissions policy microphone-only.
- [x] 4.5 The real landing copy, the design tokens and the self-hosted font all ship.

## 5. Close out

- [x] 5.1 `pnpm check` clean; both scanners clean.
- [x] 5.2 `openspec validate add-web-hosting --strict` clean.
- [x] 5.3 Log decisions; archive; commit.
