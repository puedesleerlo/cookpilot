import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
