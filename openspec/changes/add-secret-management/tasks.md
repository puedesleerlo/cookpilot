## 1. The inventory

- [x] 1.1 Add `apps/api/src/config/secrets.ts`: one declaration per secret with name, required flag, which services read it, and a description. Vertex contributes none.
- [x] 1.2 Generate `.env.example` from the inventory; add `.env*` to `.gitignore`.
- [x] 1.3 Test: inventory and `.env.example` agree; no `.env` is tracked.

## 2. Loading

- [x] 2.1 Add `apps/api/src/config/loader.ts`: Secret Manager in Cloud Run, `.env` locally, one interface.
- [x] 2.2 Reject any reference resolving `latest`; require an explicit version or pinned alias.
- [x] 2.3 Validate the whole required set at startup; exit non-zero naming each missing secret and its sources.
- [x] 2.4 Throw when a service reads a secret it did not declare.
- [x] 2.5 Tests: pinned version accepted, `latest` rejected, missing required fails before listening, optional absent is survivable, undeclared read throws.

## 3. Redaction

- [x] 3.1 Add `apps/api/src/config/redact.ts`: redact by value shape and by registered secret value.
- [x] 3.2 Tests: a key logged under an innocuous field is redacted; a key inside free text is redacted.

## 4. Provider modules

- [x] 4.1 Add `apps/api/src/providers/{vertex,brave,elevenlabs}.ts` as the single reader of each credential; Vertex reads none.
- [x] 4.2 Test: exactly one module reads each credential.

## 5. Scanning and IAM

- [x] 5.1 Add `scripts/scan-secrets.mjs` over the working tree, reporting file and shape but never the value.
- [x] 5.2 Add `infra/iam.sh`, generated from the per-service declarations, granting `secretAccessor` per service account.
- [x] 5.3 Test: the IAM script matches the declarations.
- [x] 5.4 Add `.github/workflows/ci.yml` running typecheck, lint, tests, spec validation, secret scan and bundle scan.

## 6. Close out

- [x] 6.1 `pnpm check` clean; both scanners clean; both scanners proven to fail on a planted secret.
- [x] 6.2 `openspec validate add-secret-management --strict` clean.
- [x] 6.3 Log decisions; archive; commit.
