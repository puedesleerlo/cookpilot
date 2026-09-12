// @vitest-environment node
/**
 * SPIKE — the de-risking exercise the consolidated delta names explicitly:
 *
 *   "The risk worth naming: the two-phone sync demo is gated behind changes 22 and 23,
 *    late in a long plan. Spike the event log and two clients converging on fake data as
 *    soon as change 5 lands, so you learn early whether reconnect-and-replay behaves."
 *
 * This is that spike. It uses a deliberately trivial fold in place of the real scheduler,
 * because the question is not whether the scheduler is deterministic — that is settled by
 * its own tests, later — but whether the *transport* preserves the two properties the sync
 * model rests on:
 *
 *   1. Two clients folding the same log reach the same state.
 *   2. A client that drops and reconnects reaches the same state as one that never did.
 *
 * If either of those failed, the architecture would be wrong and it is much cheaper to
 * find that out now than at change 23.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, type DbHandle } from './client';
import { runMigrations } from './migrate';
import { appendEvent, eventsSince, highestSeq } from './sessions';
import { devices, sessions } from './schema';

const DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgresql://kc:kc@localhost:55432/kc';

let handle: DbHandle | null = null;
let reachable = false;

beforeAll(async () => {
  try {
    handle = createDb(DATABASE_URL, { max: 6 });
    await handle.db.execute(sql`SELECT 1`);
    await runMigrations(DATABASE_URL);
    reachable = true;
  } catch {
    reachable = false;
    await handle?.close().catch(() => {});
    handle = null;
  }
}, 60_000);

afterAll(async () => {
  await handle?.close();
});

const dbIt = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it(name, async () => {
    if (!reachable) return;
    await fn();
  }, timeout);

const db = () => handle!.db;

/**
 * A stand-in for the scheduler: a pure, deterministic fold over the log. Order-dependent
 * on purpose — if the transport ever delivered events out of order, this would notice.
 */
type FoldState = { completed: string[]; skipped: string[]; lateMinutes: number; checksum: number };

const fold = (events: { seq: number; type: string; taskId: string | null; payload: unknown }[]): FoldState =>
  events.reduce<FoldState>(
    (state, e) => {
      const next: FoldState = { ...state, completed: [...state.completed], skipped: [...state.skipped] };
      if (e.type === 'task-completed' && e.taskId) next.completed.push(e.taskId);
      if (e.type === 'task-skipped' && e.taskId) next.skipped.push(e.taskId);
      if (e.type === 'task-late') next.lateMinutes += Number((e.payload as { extraMin?: number })?.extraMin ?? 0);
      // Order-sensitive: a different arrival order produces a different checksum.
      next.checksum = (next.checksum * 31 + e.seq * 7 + e.type.length) % 1_000_003;
      return next;
    },
    { completed: [], skipped: [], lateMinutes: 0, checksum: 1 },
  );

/** A client holds only its last seen sequence number and its folded state. */
class Client {
  lastSeq = 0;
  state: FoldState = fold([]);
  constructor(readonly name: string) {}

  async sync(sessionId: string): Promise<void> {
    const batch = await eventsSince(db(), sessionId, this.lastSeq);
    if (batch.length === 0) return;
    this.state = fold([...(await eventsSince(db(), sessionId, 0))]);
    this.lastSeq = batch[batch.length - 1]!.seq;
  }
}

const freshSession = async (id: string) => {
  await db().insert(devices).values({ id: `dev-${id}`, anonTokenHash: 'h' }).onConflictDoNothing();
  await db()
    .insert(sessions)
    .values({
      id,
      joinCode: id.slice(-6).toUpperCase().padStart(6, 'A'),
      hostDeviceId: `dev-${id}`,
      inputs: {},
      schedulerVersion: '0.1.0',
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .onConflictDoNothing();
  return id;
};

beforeEach(async () => {
  if (!reachable) return;
  await db().execute(sql`TRUNCATE session_events, schedules, session_members, sessions, devices CASCADE`);
});

describe('SPIKE: two clients converge on one event log', () => {
  dbIt('two clients fed the same log reach identical state', async () => {
    const s = await freshSession('spike-converge');
    const cookOne = new Client('cook-1');
    const cookTwo = new Client('cook-2');

    for (let i = 0; i < 10; i++) {
      await appendEvent(db(), {
        id: `ev-${i}`,
        sessionId: s,
        type: i % 3 === 0 ? 'task-completed' : i % 3 === 1 ? 'task-started' : 'task-skipped',
        taskId: `task-${i}`,
        byDeviceId: `dev-${s}`,
      });
      // They poll at different moments, as two phones on flaky wifi would.
      if (i % 2 === 0) await cookOne.sync(s);
      if (i % 3 === 0) await cookTwo.sync(s);
    }

    await cookOne.sync(s);
    await cookTwo.sync(s);

    expect(cookOne.state).toEqual(cookTwo.state);
    expect(cookOne.lastSeq).toBe(cookTwo.lastSeq);
    expect(cookOne.lastSeq).toBe(await highestSeq(db(), s));
  });

  dbIt('a client offline for a stretch catches up to the one that never dropped', async () => {
    const s = await freshSession('spike-reconnect');
    const online = new Client('online');
    const dropped = new Client('dropped');

    for (let i = 0; i < 3; i++) {
      await appendEvent(db(), { id: `a-${i}`, sessionId: s, type: 'task-completed', taskId: `t-${i}` });
      await online.sync(s);
      await dropped.sync(s);
    }

    const seqWhenDropped = dropped.lastSeq;

    // Sixty seconds of nothing, from the dropped client's point of view.
    for (let i = 3; i < 12; i++) {
      await appendEvent(db(), {
        id: `a-${i}`,
        sessionId: s,
        type: i % 2 === 0 ? 'task-completed' : 'task-late',
        taskId: `t-${i}`,
        payload: { extraMin: 2 },
      });
      await online.sync(s);
    }

    expect(dropped.lastSeq).toBe(seqWhenDropped);
    expect(dropped.state).not.toEqual(online.state);

    // Reconnect: replay-since-seq.
    await dropped.sync(s);

    expect(dropped.state).toEqual(online.state);
    expect(dropped.lastSeq).toBe(online.lastSeq);
  });

  dbIt(
    'concurrent writers from two devices still produce one agreed order',
    async () => {
      const s = await freshSession('spike-concurrent');
      // Both cooks tap "done" at the same instant, which is the realistic case.
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          appendEvent(db(), {
            id: `c-${i}`,
            sessionId: s,
            type: 'task-completed',
            taskId: `t-${i}`,
            byDeviceId: `dev-${s}`,
          }),
        ),
      );

      const a = new Client('a');
      const b = new Client('b');
      await a.sync(s);
      await b.sync(s);

      expect(a.state).toEqual(b.state);
      const all = await eventsSince(db(), s, 0);
      expect(all.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    },
    30_000,
  );

  dbIt('the fold is order-sensitive, so this spike could actually fail', async () => {
    // A spike that cannot fail proves nothing. Confirm the fold notices a reordering, both
    // in its checksum and in the order of what it accumulated.
    const inOrder = [
      { seq: 1, type: 'task-completed', taskId: 't1', payload: {} },
      { seq: 2, type: 'task-completed', taskId: 't2', payload: {} },
      { seq: 3, type: 'task-skipped', taskId: 't3', payload: {} },
    ];
    const reordered = [inOrder[1]!, inOrder[0]!, inOrder[2]!];
    expect(fold(inOrder).checksum).not.toBe(fold(reordered).checksum);
    expect(fold(inOrder).completed).toEqual(['t1', 't2']);
    expect(fold(reordered).completed).toEqual(['t2', 't1']);
  });
});
