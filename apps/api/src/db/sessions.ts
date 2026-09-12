import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { Database } from './client';
import { schedules, sessionEvents, sessionMembers, sessions } from './schema';

/**
 * Sessions and the ordered event log.
 *
 * The only interesting function here is `appendEvent`. Everything the sync model promises
 * reduces to it assigning a sequence number that is correct under concurrency.
 */

/**
 * Six characters, no `0`/`O`, no `1`/`I`/`L`. People read these aloud across a kitchen, and
 * a code that has to be spelled twice is a code that gets typed wrong once.
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export const generateJoinCode = (random: () => number): string =>
  Array.from({ length: JOIN_CODE_LENGTH }, () =>
    JOIN_CODE_ALPHABET.charAt(Math.floor(random() * JOIN_CODE_ALPHABET.length)),
  ).join('');

export type SessionEventInput = {
  sessionId: string;
  type: string;
  payload?: Record<string, unknown>;
  taskId?: string;
  byDeviceId?: string;
  /** Deterministic id, so a retried append is recognisable rather than duplicated. */
  id: string;
};

export type AppendedEvent = {
  id: string;
  seq: number;
  type: string;
  taskId: string | null;
  payload: unknown;
  byDeviceId: string | null;
  serverTs: Date;
};

/**
 * Append one event, assigning `seq` inside the transaction.
 *
 * The sequence comes from `MAX(seq) + 1` **under a row lock on the session**, not from a
 * read followed by a write. Without the lock, two concurrent appends both read the same
 * maximum, both write the same number, and one loses to the unique index — which is at
 * least safe, but turns an ordinary concurrent append into a client-visible error. With
 * it, they queue and both succeed.
 *
 * The unique index stays regardless: it is what makes the invariant true even if this
 * function is one day bypassed.
 */
export const appendEvent = async (db: Database, input: SessionEventInput): Promise<AppendedEvent> =>
  db.transaction(async (tx) => {
    // Lock the session row. Everything that appends to this log serialises here.
    const locked = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .for('update');
    if (locked.length === 0) throw new Error(`session ${input.sessionId} does not exist`);

    const [{ next }] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${sessionEvents.seq}), 0) + 1` })
      .from(sessionEvents)
      .where(eq(sessionEvents.sessionId, input.sessionId));

    const [row] = await tx
      .insert(sessionEvents)
      .values({
        id: input.id,
        sessionId: input.sessionId,
        seq: Number(next),
        type: input.type,
        payload: input.payload ?? {},
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.byDeviceId ? { byDeviceId: input.byDeviceId } : {}),
      })
      .returning();

    return {
      id: row!.id,
      seq: row!.seq,
      type: row!.type,
      taskId: row!.taskId,
      payload: row!.payload,
      byDeviceId: row!.byDeviceId,
      serverTs: row!.serverTs,
    };
  });

/** Replay-since-seq: the hot path on every reconnect. */
export const eventsSince = async (
  db: Database,
  sessionId: string,
  afterSeq: number,
): Promise<AppendedEvent[]> => {
  const rows = await db
    .select()
    .from(sessionEvents)
    .where(and(eq(sessionEvents.sessionId, sessionId), gt(sessionEvents.seq, afterSeq)))
    .orderBy(asc(sessionEvents.seq));
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    type: r.type,
    taskId: r.taskId,
    payload: r.payload,
    byDeviceId: r.byDeviceId,
    serverTs: r.serverTs,
  }));
};

export const highestSeq = async (db: Database, sessionId: string): Promise<number> => {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${sessionEvents.seq}), 0)` })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId));
  return Number(row?.max ?? 0);
};

// ------------------------------------------------------------------ schedules

export type StoredSchedule = {
  id: string;
  sessionId: string;
  computedFromSeq: number;
  schedule: unknown;
  rationale: unknown;
  makespanMin: number;
  schedulerVersion: string;
};

/**
 * Persisting the same log prefix twice is idempotent — the scheduler is a pure function, so
 * recomputing prefix N cannot produce a different answer, and treating a retry as a
 * conflict would be noise.
 */
export const saveSchedule = async (db: Database, entry: StoredSchedule): Promise<void> => {
  await db
    .insert(schedules)
    .values(entry)
    .onConflictDoUpdate({
      target: [schedules.sessionId, schedules.computedFromSeq],
      set: {
        schedule: entry.schedule,
        rationale: entry.rationale,
        makespanMin: entry.makespanMin,
        schedulerVersion: entry.schedulerVersion,
      },
    });
};

export const currentSchedule = async (
  db: Database,
  sessionId: string,
): Promise<StoredSchedule | null> => {
  const [row] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.sessionId, sessionId))
    .orderBy(desc(schedules.computedFromSeq))
    .limit(1);
  return row
    ? {
        id: row.id,
        sessionId: row.sessionId,
        computedFromSeq: row.computedFromSeq,
        schedule: row.schedule,
        rationale: row.rationale,
        makespanMin: row.makespanMin,
        schedulerVersion: row.schedulerVersion,
      }
    : null;
};

/** A schedule is stale when the log has moved past the prefix it was computed from. */
export const isScheduleStale = async (db: Database, sessionId: string): Promise<boolean> => {
  const [current, latest] = await Promise.all([
    currentSchedule(db, sessionId),
    highestSeq(db, sessionId),
  ]);
  return current === null ? latest > 0 : current.computedFromSeq < latest;
};

// -------------------------------------------------------------------- members

export const upsertMember = async (
  db: Database,
  member: {
    sessionId: string;
    deviceId: string;
    cookId: string;
    displayName: string;
    skill?: string;
  },
): Promise<void> => {
  await db
    .insert(sessionMembers)
    .values({ ...member, connected: true })
    .onConflictDoUpdate({
      target: [sessionMembers.sessionId, sessionMembers.deviceId],
      set: {
        cookId: member.cookId,
        displayName: member.displayName,
        connected: true,
        lastSeenAt: new Date(),
      },
    });
};

export const setMemberPresence = async (
  db: Database,
  sessionId: string,
  deviceId: string,
  connected: boolean,
  at: Date,
): Promise<void> => {
  await db
    .update(sessionMembers)
    .set({ connected, lastSeenAt: at })
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.deviceId, deviceId)));
};

export const membersOf = async (db: Database, sessionId: string) =>
  db.select().from(sessionMembers).where(eq(sessionMembers.sessionId, sessionId));

export const sessionByJoinCode = async (db: Database, joinCode: string) => {
  const [row] = await db.select().from(sessions).where(eq(sessions.joinCode, joinCode)).limit(1);
  return row ?? null;
};
