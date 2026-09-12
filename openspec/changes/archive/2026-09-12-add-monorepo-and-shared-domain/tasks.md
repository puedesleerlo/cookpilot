## 1. Workspace skeleton

- [x] 1.1 Add `pnpm-workspace.yaml` covering `apps/*` and `packages/*`; convert the root `package.json` to a private workspace root with `build`, `test`, `lint`, `typecheck` scripts.
- [x] 1.2 Add a shared `tsconfig.base.json`; each package extends it and emits declarations.
- [x] 1.3 Create `packages/{domain,scheduler,contracts,recipes}` and `apps/web` with package manifests named `@kitchen/*`.

## 2. Move the domain

- [x] 2.1 `git mv src/domain/*` into `packages/domain/src`; rewrite `@/domain` imports to `@kitchen/domain`.
- [x] 2.2 Move the lexicon into `packages/domain/src/lexicon.ts`, re-scoped to dictionary lookup and autocomplete.
- [x] 2.3 Move the cooking-verb table into `packages/domain/src/verb-ranges.ts` as the plausible-range table the L4 validator will use.
- [x] 2.4 Move the test factories into `packages/domain/src/testing.ts` so every package can use them.

## 3. Move recipes and the web app

- [x] 3.1 `git mv src/recipes/*` into `packages/recipes/src`; seed pack JSON moves with it.
- [x] 3.2 `git mv src/ui`, `src/app`, `src/assets`, `index.html`, Vite/Tailwind/PostCSS config into `apps/web`.
- [x] 3.3 Rewrite `demo.ts` and the session store against the new intake model; delete the abandoned conversational screen.
- [x] 3.4 Update the design-canvas and seed-pack build scripts for the new paths.

## 4. Delete what the delta supersedes

- [x] 4.1 Delete the natural-language slot parser, the Web Speech hook and the conversational intake screen.
- [x] 4.2 Remove the Anthropic SDK and every `VITE_ANTHROPIC_API_KEY` reference.
- [x] 4.3 Leave `callStage`'s shape in place but move it to `apps/api`; the provider is replaced in `add-gemini-gateway`.
- [x] 4.4 Add a test asserting no free-text slot extractor exists anywhere in the workspace.

## 5. Boundaries

- [x] 5.1 Rewrite `eslint.config.js` against package names: domain is a leaf, applications are never dependencies, scheduler imports only domain.
- [x] 5.2 Extend the scheduler purity rules to ban Node built-ins, so it still compiles for the browser.
- [x] 5.3 Forbid `apps/web` from importing `apps/api` or `apps/worker`.
- [x] 5.4 Add a bundle-scanning script that fails when a provider secret name appears in the built client.
- [x] 5.5 Port the boundary test suite to the new rules.

## 6. Close out

- [x] 6.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all clean from the root.
- [x] 6.2 Rewrite `openspec/project.md` for the new architecture.
- [x] 6.3 `openspec validate add-monorepo-and-shared-domain --strict` clean.
- [x] 6.4 Log decisions; archive; commit.
