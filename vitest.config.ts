import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * One Vitest run covers the whole workspace, so a break in `packages/domain` surfaces in
 * the package that consumes it rather than only where it was introduced.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      '@kitchen/domain/testing': fileURLToPath(new URL('./packages/domain/src/testing.ts', import.meta.url)),
      '@kitchen/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      '@kitchen/scheduler': fileURLToPath(new URL('./packages/scheduler/src/index.ts', import.meta.url)),
      '@kitchen/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@kitchen/recipes': fileURLToPath(new URL('./packages/recipes/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./apps/web/src/test/setup.ts'],
    include: ['{apps,packages}/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
