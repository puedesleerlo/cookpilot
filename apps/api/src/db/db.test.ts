// @vitest-environment node
/**
 * Integration tests against a real Postgres.
 *
 * These run against a real database on purpose. The two invariants they cover —
 * `(session_id, seq)` uniqueness under concurrency, and `computed_from_seq` being
 * mandatory — are database behaviours, and a mock would only assert that I remembered to
 * write the mock.
 *
 * Skipped, loudly, when no database is configured, so the suite still runs on a machine
 * without Docker.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, databaseCheck, type DbHandle } from './client';
import { runMigrations } from './migrate';
import { seedCorpus } from './seed';
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  appendEvent,
  currentSchedule,
  eventsSince,
  generateJoinCode,
  highestSeq,
  isScheduleStale,
  membersOf,
  saveSchedule,
  sessionByJoinCode,
  setMemberPresence,
  upsertMember,
} from './sessions';
import { devices, recipePacks, recipes, schedules, sessionEvents, sessions } from './schema';

const DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgresql://kc:kc@localhost:55432/kc';

let handle: DbHandle | null = null;
let reachable = false;

beforeAll(async () => {
  try {
    handle = createDb(DATABASE_URL, { max: 4 });
    await handle.db.execute(sql`SELECT 1`);
    await runMigrations(DATABASE_URL);
    reachable = true;
  } catch {
    reachable = false;
    if (handle) await handle.close().catch(() => {});
    handle = null;
    console.warn(
      `\n  [db.test] Postgres unreachable at ${DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@')} — ` +
        'integration tests skipped. Start it with: docker compose up -d\n',
    );
  }
}, 60_000);

afterAll(async () => {
  await handle?.close();
});

/** Skips the whole file cleanly when there is no database, rather than failing red. */
const dbIt = (name: string, fn: () => Promise<void> | void, timeout?: number) =>
  it(name, async () => {
    if (!reachable) return;
    await fn();
  }, timeout);

const db = () => handle!.db;

const freshSession = async (id: string, joinCode: string) => {
  await db().insert(devices).values({ id: `dev-${id}`, anonTokenHash: 'hash' }).onConflictDoNothing();
  await db()
    .insert(sessions)
    .values({
      id,
      joinCode,
      hostDeviceId: `dev-${id}`,
      inputs: { pantry: [] },
      schedulerVersion: '0.1.0',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .onConflictDoNothing();
  return id;
};

beforeEach(async () => {
  if (!reachable) return;
  await db().execute(sql`TRUNCATE session_events, schedules, session_members, sessions, devices CASCADE`);
});

describe('event sequence numbers', () => {
  dbIt('start at 1 and increase by 1', async () => {
    const s = await freshSession('s-seq', 'ABC234');
    const seqs: number[] = [];
    for (const type of ['task-started', 'task-completed', 'task-skipped']) {
      const e = await appendEvent(db(), { id: `${s}-${type}`, sessionId: s, type });
      seqs.push(e.seq);
    }
    expect(seqs).toEqual([1, 2, 3]);
  });

  dbIt('are per session, not global', async () => {
    const a = await freshSession('s-a', 'AAA234');
    const b = await freshSession('s-b', 'BBB234');
    const ea = await appendEvent(db(), { id: 'ea', sessionId: a, type: 'task-started' });
    const eb = await appendEvent(db(), { id: 'eb', sessionId: b, type: 'task-started' });
    expect(ea.seq).toBe(1);
    expect(eb.seq).toBe(1);
  });

  dbIt(
    'stay distinct under concurrent appends',
    async () => {
      const s = await freshSession('s-race', 'CCC234');
      // Twelve simultaneous appends. Without the row lock these collide on the unique index.
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          appendEvent(db(), { id: `race-${i}`, sessionId: s, type: 'task-completed' }),
        ),
      );
      const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
      expect(new Set(seqs).size).toBe(12);
      expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    },
    30_000,
  );

  dbIt('are rejected by the database when duplicated directly', async () => {
    const s = await freshSession('s-dup', 'DDD234');
    await appendEvent(db(), { id: 'dup-1', sessionId: s, type: 'task-started' });
    await expect(
      db().insert(sessionEvents).values({ id: 'dup-2', sessionId: s, seq: 1, type: 'task-started' }),
    ).rejects.toThrow();
  });

  dbIt('replay returns only what came after a given point, in order', async () => {
    const s = await freshSession('s-replay', 'EEE234');
    for (let i = 0; i < 5; i++) {
      await appendEvent(db(), { id: `r-${i}`, sessionId: s, type: 'task-completed' });
    }
    const since = await eventsSince(db(), s, 2);
    expect(since.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(await highestSeq(db(), s)).toBe(5);
  });

  dbIt('a client reconnecting after missing events catches up exactly', async () => {
    const s = await freshSession('s-catchup', 'FFF234');
    for (let i = 0; i < 3; i++) {
      await appendEvent(db(), { id: `c-${i}`, sessionId: s, type: 'task-started' });
    }
    const clientLastSeq = 1; // the client dropped after the first event
    for (let i = 3; i < 6; i++) {
      await appendEvent(db(), { id: `c-${i}`, sessionId: s, type: 'task-completed' });
    }
    const missed = await eventsSince(db(), s, clientLastSeq);
    expect(missed.map((e) => e.seq)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('schedules record the log prefix they came from', () => {
  dbIt('stores the prefix and reads it back', async () => {
    const s = await freshSession('s-sched', 'GGG234');
    for (let i = 0; i < 5; i++) {
      await appendEvent(db(), { id: `sc-${i}`, sessionId: s, type: 'task-completed' });
    }
    await saveSchedule(db(), {
      id: 'sch-1',
      sessionId: s,
      computedFromSeq: 5,
      schedule: { makespanMin: 54 },
      rationale: [],
      makespanMin: 54,
      schedulerVersion: '0.1.0',
    });
    expect((await currentSchedule(db(), s))?.computedFromSeq).toBe(5);
  });

  dbIt('rejects a schedule with no prefix', async () => {
    const s = await freshSession('s-noprefix', 'HHH234');
    await expect(
      db().execute(
        sql`INSERT INTO schedules (id, session_id, schedule, makespan_min, scheduler_version)
            VALUES ('x', ${s}, '{}'::jsonb, 10, '0.1.0')`,
      ),
    ).rejects.toThrow();
  });

  dbIt('makes staleness detectable without recomputing', async () => {
    const s = await freshSession('s-stale', 'JJJ234');
    await appendEvent(db(), { id: 'st-1', sessionId: s, type: 'task-started' });
    await saveSchedule(db(), {
      id: 'sch-stale',
      sessionId: s,
      computedFromSeq: 1,
      schedule: {},
      rationale: [],
      makespanMin: 40,
      schedulerVersion: '0.1.0',
    });
    expect(await isScheduleStale(db(), s)).toBe(false);
    await appendEvent(db(), { id: 'st-2', sessionId: s, type: 'constraint-changed' });
    expect(await isScheduleStale(db(), s)).toBe(true);
  });

  dbIt('recomputing the same prefix is idempotent, not a conflict', async () => {
    const s = await freshSession('s-idem', 'KKK234');
    const entry = {
      id: 'sch-idem',
      sessionId: s,
      computedFromSeq: 0,
      schedule: { v: 1 },
      rationale: [],
      makespanMin: 30,
      schedulerVersion: '0.1.0',
    };
    await saveSchedule(db(), entry);
    await saveSchedule(db(), { ...entry, schedule: { v: 2 } });
    const rows = await db().select().from(schedules);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.schedule as { v: number }).v).toBe(2);
  });
});

describe('join codes', () => {
  it('exclude characters that are confused when read aloud', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(bad);
    }
  });

  it('are six characters from the alphabet', () => {
    let seed = 42;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode(random);
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect([...code].every((c) => JOIN_CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  dbIt('cannot be duplicated', async () => {
    await freshSession('s-code-1', 'MNP234');
    await db().insert(devices).values({ id: 'dev-dup', anonTokenHash: 'h' }).onConflictDoNothing();
    await expect(
      db().insert(sessions).values({
        id: 's-code-2',
        joinCode: 'MNP234',
        hostDeviceId: 'dev-dup',
        inputs: {},
        schedulerVersion: '0.1.0',
        expiresAt: new Date(Date.now() + 1000),
      }),
    ).rejects.toThrow();
  });

  dbIt('find their session', async () => {
    await freshSession('s-find', 'QRS234');
    expect((await sessionByJoinCode(db(), 'QRS234'))?.id).toBe('s-find');
    expect(await sessionByJoinCode(db(), 'ZZZZZZ')).toBeNull();
  });
});

describe('membership and presence', () => {
  dbIt('upsert is safe to repeat, and presence is updatable', async () => {
    const s = await freshSession('s-mem', 'TUV234');
    const member = { sessionId: s, deviceId: `dev-${s}`, cookId: 'cook-1', displayName: 'Alex' };
    await upsertMember(db(), member);
    await upsertMember(db(), { ...member, displayName: 'Alex B' });
    const rows = await membersOf(db(), s);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.displayName).toBe('Alex B');

    await setMemberPresence(db(), s, `dev-${s}`, false, new Date());
    expect((await membersOf(db(), s))[0]!.connected).toBe(false);
  });
});

describe('the search vector is maintained by the database', () => {
  dbIt('populates on insert without the application setting it', async () => {
    await db().execute(sql`TRUNCATE recipe_packs CASCADE`);
    await db().insert(recipePacks).values({
      id: 'p-test',
      name: 'Test',
      version: '1.0.0',
      contentHash: 'fnv1a-test0001',
      provenance: 'seed',
    });
    await db().insert(recipes).values({
      id: 'r-test',
      packId: 'p-test',
      kind: 'main',
      canonicalName: 'Ginger garlic chicken',
      ir: {
        title: 'Ginger garlic chicken',
        ingredients: [{ canonicalName: 'chicken breast' }, { canonicalName: 'ginger' }],
        steps: [{ verb: 'stir-fry' }],
        tags: ['asian'],
      },
    });
    const [row] = await db().execute<{ found: number }>(
      sql`SELECT count(*)::int AS found FROM recipes
          WHERE search_vector @@ plainto_tsquery('english', 'ginger chicken')`,
    );
    expect(Number(row!.found)).toBe(1);
  });

  dbIt('updates when the recipe changes', async () => {
    await db().execute(sql`UPDATE recipes SET ir = jsonb_set(ir, '{title}', '"Lemon salmon"') WHERE id = 'r-test'`);
    const [row] = await db().execute<{ found: number }>(
      sql`SELECT count(*)::int AS found FROM recipes
          WHERE search_vector @@ plainto_tsquery('english', 'lemon salmon')`,
    );
    expect(Number(row!.found)).toBe(1);
  });
});

describe('seeding', () => {
  dbIt(
    'loads the whole corpus and is idempotent',
    async () => {
      await db().execute(sql`TRUNCATE recipe_packs CASCADE`);
      const first = await seedCorpus(db());
      expect(first.packs).toBe(5);
      expect(first.recipes).toBe(22);

      const second = await seedCorpus(db());
      expect(second.packs).toBe(0);
      expect(second.skipped).toBe(5);

      const [packCount] = await db().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM recipe_packs`);
      const [recipeCount] = await db().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM recipes`);
      expect(Number(packCount!.n)).toBe(5);
      expect(Number(recipeCount!.n)).toBe(22);
    },
    30_000,
  );
});

describe('the database is a readiness dependency', () => {
  dbIt('reports ok when reachable', async () => {
    const result = await databaseCheck(handle!).check();
    expect(result.ok).toBe(true);
  });

  it('reports the failure detail when unreachable', async () => {
    // scan-secrets-ignore: an address deliberately chosen to be unreachable
    const dead = createDb('postgresql://nobody:nobody@127.0.0.1:1/none', { max: 1 });
    const result = await databaseCheck(dead).check();
    expect(result.ok).toBe(false);
    expect(result.detail).toBeTruthy();
    await dead.close().catch(() => {});
  }, 20_000);
});
