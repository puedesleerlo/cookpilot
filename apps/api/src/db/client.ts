import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

/**
 * The database connection.
 *
 * Cloud Run runs many small instances, so the pool is deliberately small: a dozen
 * instances each holding twenty connections exhausts Postgres long before it exhausts the
 * CPU. `max: 5` per instance is the right shape for this deployment, not a timid default.
 */
export type Database = PostgresJsDatabase<typeof schema>;

export type DbHandle = {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
};

export const createDb = (connectionString: string, opts: { max?: number } = {}): DbHandle => {
  const client = postgres(connectionString, {
    max: opts.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Long-lived prepared statements do not survive a connection pooler in transaction mode.
    prepare: false,
    onnotice: () => {},
  });
  return {
    db: drizzle(client, { schema }),
    sql: client,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
};

/**
 * A readiness check, not a liveness one. Deliberately trivial: readiness should answer
 * "can I reach the database", not "is the database fast today".
 */
export const databaseCheck = (handle: DbHandle) => ({
  name: 'postgres',
  check: async (): Promise<{ ok: boolean; detail?: string }> => {
    try {
      await handle.db.execute(sql`SELECT 1`);
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'query failed' };
    }
  },
});

export { schema };
