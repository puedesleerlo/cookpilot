import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  /**
   * Env files live at the repository root, next to `.env.example`.
   *
   * That is where `.env` is, and where `.env.production` pins the deployed API URL. Only
   * `VITE_*` names reach the bundle; the provider secrets in the same file never do, and
   * the bundle scanner fails the build if one did.
   *
   * This key was briefly declared twice — once here and once pointing at `apps/web` — and
   * the second silently won, so a production build read the wrong directory, found no
   * `VITE_API_URL`, and fell back to the page's own origin. On Firebase Hosting that is a
   * static bucket with no API behind it: the app came up looking perfect and failed on the
   * first recipe search.
   */
  envDir: '../..',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Listen on every interface: a phone that scans the QR code on a laptop's screen has to
    // be able to load the page from the laptop's network address, not just from localhost.
    host: true,
  },
  build: {
    // The bundle scanner reads these; keep names stable so CI can grep them.
    sourcemap: false,
    outDir: 'dist',
  },
});
