## 1. Model configuration

- [x] 1.1 Add `apps/api/src/llm/models.ts`: one model per stage, each with a rationale, a region, and an env override.
- [x] 1.2 Record per-million-token pricing and a cost estimator.
- [x] 1.3 Leave the expensive L3 hard path disabled by default.
- [x] 1.4 Tests: no model string outside the config module; no Gemini 2.5 string anywhere, tests included; each stage independently overridable.

## 2. The provider

- [x] 2.1 Add `apps/api/src/llm/vertex.ts` using ADC — project and location only, no credential.
- [x] 2.2 Pass the Zod-derived schema as `responseJsonSchema` so generation is constrained by the same definition validation uses.
- [x] 2.3 Test: the module reads no key, and the secret inventory has no model entry.

## 3. The gateway

- [x] 3.1 Add `apps/api/src/llm/gateway.ts`: stage allowlist, prompt built here, timeout, one repair, deterministic fallback.
- [x] 3.2 Add the content-hash cache over `llm_cache`, keyed on stage, model and input.
- [x] 3.3 Add per-stage cost accounting and expose it on `GET /internal/metrics`.
- [x] 3.4 Add demo-mode fixtures, validated like any other response.
- [x] 3.5 Tests: constrained-but-wrong output is caught, repair fires once, cache hit costs nothing, stale cache and stale fixture both fail safely, a client cannot pass a prompt through.

## 4. Close out

- [x] 4.1 `pnpm check` clean.
- [x] 4.2 `openspec validate add-gemini-gateway --strict` clean.
- [x] 4.3 Log decisions; archive; commit.
