import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { devices } from '../db/schema';
import {
  appendEvent,
  claimCook,
  createSession,
  eventsSince,
  highestSeq,
  isUniqueViolation,
  markSessionStarted,
  membersOf,
  sessionByJoinCode,
  sessionById,
  type AppendedEvent,
  type ClaimResult,
  type NewSession,
  type SessionEventInput,
} from '../db/sessions';

/**
 * Where sessions live.
 *
 * Two backends, one interface. Postgres is the real one: the ordered log's invariants are
 * enforced by the database itself, and a session survives the process. Memory is for an
 * instance with no database behind it — a deploy that serves the pipeline and nothing
 * else, a laptop without Docker, a test. It holds the same shapes and keeps the same
 * promises for as long as the process lives, and it is honest about the rest: one instance,
 * and nothing survives a restart.
 *
 * The routes see only this interface, so the two cannot drift in what they accept or
 * return; the same test suite runs against both.
 */

export type StoredDevice = { id: string; anonTokenHash: string; createdAt: Date; lastSeenAt: Date };

export type StoredSession = {
  id: string;
  joinCode: string;
  hostDeviceId: string;
  status: string;
  inputs: unknown;
  crew: unknown;
  scheduleHash: string;
  schedulerVersion: string;
  startedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

export type StoredMember = {
  sessionId: string;
  deviceId: string;
  cookId: string;
  displayName: string;
  skill: string;
  connected: boolean;
  lastSeenAt: Date;
};

export type CookClaim = {
  sessionId: string;
  deviceId: string;
  cookId: string;
  displayName: string;
  skill?: string;
};

/** Two sessions cannot share a join code. Callers draw another and try again. */
export class JoinCodeTakenError extends Error {
  constructor(joinCode: string) {
    super(`join code ${joinCode} is already in use`);
    this.name = 'JoinCodeTakenError';
  }
}

export interface SessionStore {
  readonly kind: 'postgres' | 'memory';

  insertDevice(device: { id: string; anonTokenHash: string }, at: Date): Promise<void>;
  findDevice(id: string): Promise<StoredDevice | null>;
  touchDevice(id: string, at: Date): Promise<void>;
  /** Revocation is deletion; verification checks for it on every request. */
  deleteDevice(id: string): Promise<void>;

  /** Throws `JoinCodeTakenError` on a collision, never silently overwrites. */
  createSession(session: NewSession, at: Date): Promise<void>;
  sessionById(id: string): Promise<StoredSession | null>;
  sessionByJoinCode(joinCode: string): Promise<StoredSession | null>;
  markSessionStarted(id: string, at: Date): Promise<void>;

  membersOf(sessionId: string): Promise<StoredMember[]>;
  /** Decides between competing claims so that exactly one device holds a cook. */
  claimCook(claim: CookClaim, at: Date): Promise<ClaimResult>;

  /** Assigns `seq`, dense from 1, in one agreed order per session. */
  appendEvent(input: SessionEventInput, at: Date): Promise<AppendedEvent>;
  eventsSince(sessionId: string, afterSeq: number): Promise<AppendedEvent[]>;
  highestSeq(sessionId: string): Promise<number>;
}

// -------------------------------------------------------------------- postgres

/** The real backend: a thin face over `db/sessions.ts`, whose invariants live in the schema. */
export const postgresSessionStore = (db: Database): SessionStore => ({
  kind: 'postgres',

  insertDevice: async (device, at) => {
    await db.insert(devices).values({ ...device, createdAt: at, lastSeenAt: at });
  },
  findDevice: async (id) => {
    const [row] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    return row ?? null;
  },
  touchDevice: async (id, at) => {
    await db.update(devices).set({ lastSeenAt: at }).where(eq(devices.id, id));
  },
  deleteDevice: async (id) => {
    await db.delete(devices).where(eq(devices.id, id));
  },

  createSession: async (session) => {
    try {
      await createSession(db, session);
    } catch (err) {
      if (isUniqueViolation(err)) throw new JoinCodeTakenError(session.joinCode);
      throw err;
    }
  },
  sessionById: (id) => sessionById(db, id),
  sessionByJoinCode: (code) => sessionByJoinCode(db, code),
  markSessionStarted: (id, at) => markSessionStarted(db, id, at),

  membersOf: (sessionId) => membersOf(db, sessionId),
  claimCook: (claim) => claimCook(db, claim),

  // The database stamps the event with its own clock; `at` is for the backend that has none.
  appendEvent: (input) => appendEvent(db, input),
  eventsSince: (sessionId, afterSeq) => eventsSince(db, sessionId, afterSeq),
  highestSeq: (sessionId) => highestSeq(db, sessionId),
});

// ---------------------------------------------------------------------- memory

/** Expired sessions linger this long before being forgotten, so a late poll gets `session_expired`, not `not_found`. */
const EXPIRED_GRACE_MS = 60 * 60 * 1000;

/**
 * The backend for an instance with nothing behind it.
 *
 * JavaScript's single thread is the lock: a claim or an append runs to completion before
 * the next one starts, which is exactly what the row lock buys in Postgres. What memory
 * cannot buy is a second instance or a restart; whoever runs this backend runs one
 * instance and accepts that a session lives as long as the process.
 */
export const memorySessionStore = (): SessionStore => {
  const devicesById = new Map<string, StoredDevice>();
  const sessionsById = new Map<string, StoredSession>();
  const membersBySession = new Map<string, StoredMember[]>();
  const eventsBySession = new Map<string, AppendedEvent[]>();

  const forget = (id: string): void => {
    sessionsById.delete(id);
    membersBySession.delete(id);
    eventsBySession.delete(id);
  };

  /** Bound the memory a long-lived process holds: nothing is kept past its usefulness. */
  const sweep = (at: Date): void => {
    for (const [id, session] of sessionsById) {
      if (session.expiresAt.getTime() + EXPIRED_GRACE_MS <= at.getTime()) forget(id);
    }
  };

  const copy = <T>(value: T): T => structuredClone(value);

  return {
    kind: 'memory',

    insertDevice: async (device, at) => {
      devicesById.set(device.id, { ...device, createdAt: at, lastSeenAt: at });
    },
    findDevice: async (id) => copy(devicesById.get(id) ?? null),
    touchDevice: async (id, at) => {
      const device = devicesById.get(id);
      if (device) device.lastSeenAt = at;
    },
    deleteDevice: async (id) => {
      devicesById.delete(id);
    },

    createSession: async (session, at) => {
      sweep(at);
      for (const other of sessionsById.values()) {
        if (other.joinCode === session.joinCode) throw new JoinCodeTakenError(session.joinCode);
      }
      sessionsById.set(session.id, {
        ...session,
        status: 'open',
        startedAt: null,
        createdAt: at,
      });
      membersBySession.set(session.id, []);
      eventsBySession.set(session.id, []);
    },
    sessionById: async (id) => copy(sessionsById.get(id) ?? null),
    sessionByJoinCode: async (code) => {
      for (const session of sessionsById.values()) {
        if (session.joinCode === code) return copy(session);
      }
      return null;
    },
    markSessionStarted: async (id, at) => {
      const session = sessionsById.get(id);
      if (session) {
        session.status = 'cooking';
        session.startedAt = at;
      }
    },

    membersOf: async (sessionId) => copy(membersBySession.get(sessionId) ?? []),
    claimCook: async (claim, at) => {
      if (!sessionsById.has(claim.sessionId)) throw new Error(`session ${claim.sessionId} does not exist`);
      const members = membersBySession.get(claim.sessionId) ?? [];
      const holder = members.find((m) => m.cookId === claim.cookId && m.deviceId !== claim.deviceId);
      if (holder) return { ok: false, holder: holder.displayName };
      const kept = members.filter((m) => m.deviceId !== claim.deviceId);
      kept.push({
        sessionId: claim.sessionId,
        deviceId: claim.deviceId,
        cookId: claim.cookId,
        displayName: claim.displayName,
        skill: claim.skill ?? 'intermediate',
        connected: true,
        lastSeenAt: at,
      });
      membersBySession.set(claim.sessionId, kept);
      return { ok: true };
    },

    appendEvent: async (input, at) => {
      const log = eventsBySession.get(input.sessionId);
      if (!log) throw new Error(`session ${input.sessionId} does not exist`);
      const last = log[log.length - 1];
      const event: AppendedEvent = {
        id: input.id,
        seq: (last?.seq ?? 0) + 1,
        type: input.type,
        taskId: input.taskId ?? null,
        payload: input.payload ?? {},
        byDeviceId: input.byDeviceId ?? null,
        serverTs: at,
      };
      log.push(event);
      return copy(event);
    },
    eventsSince: async (sessionId, afterSeq) =>
      copy((eventsBySession.get(sessionId) ?? []).filter((e) => e.seq > afterSeq)),
    highestSeq: async (sessionId) => {
      const log = eventsBySession.get(sessionId) ?? [];
      return log[log.length - 1]?.seq ?? 0;
    },
  };
};
