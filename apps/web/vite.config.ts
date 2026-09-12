import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  /**
   * The one `.env` lives at the repository root, next to `.env.example`, and it is where
   * `VITE_API_URL` is documented. Left at the default, Vite reads `apps/web/.env`, which
   * does not exist, and the client quietly calls its own origin for the API. Only `VITE_*`
   * names reach the bundle; the provider secrets in the same file never do, and the bundle
   * scanner fails the build if one did.
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
