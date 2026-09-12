import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? 'postgresql://kc:kc@localhost:55432/kc' },
  strict: true,
  verbose: true,
});
