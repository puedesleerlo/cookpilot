import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createDb } from './client';
import { RAW_MIGRATION_SQL } from './schema';

/**
 * The migration runner.
 *
 * Run as an explicit release step, never by a booting instance. Cloud Run starts several
 * instances at once; if each tried to migrate, they would race, and the loser's failure
 * would look like a broken deploy rather than a lost race. Making it a release step also
 * means a failed migration stops the deploy instead of half-migrating under live traffic.
 *
 * Usage: node --experimental-strip-types src/db/migrate.ts
 */
const here = path.dirname(fileURLToPath(import.meta.url));

export const runMigrations = async (connectionString: string): Promise<void> => {
  const handle = createDb(connectionString, { max: 1 });
  try {
    // pgvector must exist before the generated migration creates a vector column.
    await handle.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await migrate(handle.db, { migrationsFolder: path.join(here, '../../drizzle') });
    // Everything the generator cannot express: the tsvector column, its trigger, its index.
    for (const statement of RAW_MIGRATION_SQL) {
      await handle.db.execute(sql.raw(statement));
    }
  } finally {
    await handle.close();
  }
};

const isEntryPoint = process.argv[1]?.endsWith('migrate.ts') ?? false;
if (isEntryPoint) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      process.stdout.write('migrations applied\n');
      process.exit(0);
    })
    .catch((err: unknown) => {
      process.stderr.write(`migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
