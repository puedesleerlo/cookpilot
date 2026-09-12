// Flat ESLint config. The `files`-scoped blocks at the bottom encode the
// architectural boundaries from openspec/project.md as lint errors, so a
// violation fails CI instead of quietly rotting.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Import patterns each layer is forbidden to reach for. */
const forbid = (patterns, why) => ({
  'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ ...group, message: why })) }],
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'openspec'] },
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

  // ---- Layer: domain. Depends on nothing but itself. ----
  {
    files: ['src/domain/**/*.ts'],
    rules: forbid(
      [{ group: ['@/scheduler/*', '@/llm/*', '@/ui/*', '@/recipes/*', '@/app/*'] }],
      'src/domain is the base layer and must not import from any other layer.',
    ),
  },

  // ---- Layer: scheduler. Pure, deterministic, zero I/O, zero randomness. ----
  {
    files: ['src/scheduler/**/*.ts'],
    ignores: ['src/scheduler/**/*.test.ts'],
    rules: {
      ...forbid(
        [{ group: ['@/llm/*', '@/ui/*', '@/recipes/*', '@/app/*'] }],
        'src/scheduler must stay pure: it may only import from @/domain and its own modules.',
      ),
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'src/scheduler must be I/O free.' },
        { name: 'localStorage', message: 'src/scheduler must be I/O free.' },
        { name: 'indexedDB', message: 'src/scheduler must be I/O free.' },
        { name: 'crypto', message: 'src/scheduler must be deterministic; use a seeded source.' },
        { name: 'performance', message: 'src/scheduler must be deterministic; no wall-clock reads.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'src/scheduler must be deterministic; use a seeded PRNG from @/scheduler/rng.' },
        { object: 'Date', property: 'now', message: 'src/scheduler must be deterministic; pass time in as a parameter.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'src/scheduler must be deterministic; pass time in as a parameter.' },
      ],
    },
  },

  // ---- Layer: recipes. Pack loading and IR normalization. ----
  {
    files: ['src/recipes/**/*.ts'],
    rules: forbid(
      [{ group: ['@/scheduler/*', '@/ui/*', '@/app/*'] }],
      'src/recipes may import @/domain (and @/llm for normalization) only.',
    ),
  },

  // ---- Layer: llm. May call the model. Returns validated data. Never schedules. ----
  {
    files: ['src/llm/**/*.ts'],
    rules: forbid(
      [{ group: ['@/scheduler/*', '@/ui/*', '@/app/*'] }],
      'src/llm must never schedule; it returns validated data for @/app to route.',
    ),
  },

  // ---- Layer: ui. Renders. Never computes a schedule. ----
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: forbid(
      [{ group: ['@/scheduler', '@/scheduler/*', '@/llm', '@/llm/*', '@/recipes/*'] }],
      'src/ui renders only. Go through a use-case in @/app instead of invoking the engine directly.',
    ),
  },

  // ---- Tests and tooling may reach anywhere. ----
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-restricted-imports': 'off', 'no-restricted-globals': 'off', 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' },
  },
);
