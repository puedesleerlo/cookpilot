// Flat ESLint config.
//
// The `files`-scoped blocks below encode the package dependency rules from
// openspec/project.md as lint errors. Three of them are load-bearing:
//
//   1. `packages/scheduler` must stay pure AND browser-compilable, because the same
//      package is compiled into the API and into the web bundle. A Node built-in there
//      breaks the offline demo path; an ambient clock read breaks determinism, which
//      breaks the guarantee that a reconnecting client agrees with the server.
//   2. No package may import an application. Packages are the shared floor; the moment
//      one reaches up into `apps/api` the web bundle inherits server code.
//   3. `apps/web` may not import `apps/api` or `apps/worker` at all — that is the line a
//      provider secret would cross.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrict = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ ...group, message })) }],
});

/**
 * Every workspace application, as import patterns.
 *
 * `no-restricted-imports` matches the literal specifier, not the resolved path, so a
 * relative escape like `../../api/src/server` is not caught by `**\/apps/**` -- the
 * string has no `apps/` in it. The `**\/<app>/src/**` entries are what actually close
 * that hole.
 */
const APPS = [
  '@kitchen/web',
  '@kitchen/api',
  '@kitchen/worker',
  '**/apps/**',
  '**/api/src/**',
  '**/web/src/**',
  '**/worker/src/**',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'openspec/**', 'design/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },

  // ---- packages/domain: the leaf. Depends on nothing in the workspace. ----
  {
    files: ['packages/domain/**/*.ts'],
    rules: restrict(
      [{ group: ['@kitchen/*', ...APPS] }],
      'packages/domain is the base package and must not import from any other workspace package or application.',
    ),
  },

  // ---- packages/scheduler: pure, deterministic, and browser-compilable. ----
  {
    files: ['packages/scheduler/**/*.ts'],
    ignores: ['packages/scheduler/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@kitchen/recipes', '@kitchen/contracts', '@kitchen/scheduler', ...APPS],
              message: 'packages/scheduler may import @kitchen/domain and its own modules only.',
            },
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'os', 'child_process', 'worker_threads'],
              message:
                'packages/scheduler is compiled into the browser bundle too; it must not use Node built-ins.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'packages/scheduler must be I/O free.' },
        { name: 'localStorage', message: 'packages/scheduler must be I/O free.' },
        { name: 'indexedDB', message: 'packages/scheduler must be I/O free.' },
        { name: 'crypto', message: 'packages/scheduler must be deterministic; use a seeded source.' },
        { name: 'performance', message: 'packages/scheduler must be deterministic; no wall-clock reads.' },
        { name: 'process', message: 'packages/scheduler must be environment free.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'packages/scheduler must be deterministic; use the seeded generator.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'packages/scheduler must be deterministic; pass time in as a parameter.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'packages/scheduler must be deterministic; pass time in as a parameter.',
        },
      ],
    },
  },

  // ---- packages/contracts: domain only. ----
  {
    files: ['packages/contracts/**/*.ts'],
    rules: restrict(
      [{ group: ['@kitchen/scheduler', '@kitchen/contracts', '@kitchen/recipes', ...APPS] }],
      'This package may import @kitchen/domain and its own modules only.',
    ),
  },

  /**
   * ---- packages/recipes: domain and the scheduler. ----
   *
   * The plan builder does not guess whether a session fits any more -- it compiles the
   * candidate plan and keeps it only if the schedule comes out inside the budget with
   * nothing cut. That needs the scheduler, and `recipes -> scheduler -> domain` stays
   * acyclic and browser-safe, so the properties this boundary protects are untouched.
   */
  {
    files: ['packages/recipes/**/*.ts'],
    rules: restrict(
      [{ group: ['@kitchen/contracts', '@kitchen/recipes', ...APPS] }],
      'packages/recipes may import @kitchen/domain, @kitchen/scheduler and its own modules only.',
    ),
  },

  // ---- apps/web: renders. Never reaches a provider, a database or a queue. ----
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: restrict(
      [
        {
          group: [
            '@kitchen/api',
            '@kitchen/worker',
            '**/apps/api/**',
            '**/apps/worker/**',
            '**/api/src/**',
            '**/worker/src/**',
            '@google-cloud/*',
            'pg',
            'drizzle-orm',
            'bullmq',
            'ioredis',
            'fastify',
          ],
        },
      ],
      'apps/web must not import server code. Talk to the API through @kitchen/contracts.',
    ),
  },

  // ---- apps/api and apps/worker: may use packages, never each other or the web app. ----
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts'],
    rules: restrict(
      [{ group: ['@kitchen/web', '**/apps/web/**', '**/web/src/**'] }],
      'Server applications must not import the web client.',
    ),
    languageOptions: { globals: { ...globals.node } },
  },

  // ---- Tests and tooling reach anywhere. ----
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/test/**', 'scripts/**', '*.config.{js,ts}', '**/*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
