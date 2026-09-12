import { create } from 'zustand';
import { contentHash } from '@kitchen/domain';
import { SCHEDULER_VERSION } from '@kitchen/scheduler';
import type { SessionEvent, SessionView } from '@kitchen/contracts';
import { ApiRequestError, api, ensureDevice, isApiError, offsetFrom } from './api';
import { compileSession, type CompileOutcome } from './compile';
import { completedFrom } from './story';
import type { IntakeAnswers } from './store';

/**
 * The shared session, on this device.
 *
 * What is synced is the inputs and the ordered log, never the schedule. Every device — the
 * laptop that compiled, the two phones that scanned it — compiles its own timeline from the
 * same inputs and folds the same log over it, so they agree because they did the same
 * arithmetic, not because one of them was told the answer. The host's hash of its schedule
 * travels with the session so that agreement is checked rather than assumed.
 *
 * The clock is the server's. Every response carries the server's time, and the offset to
 * this device's clock is re-measured on each one, so two phones count down together to
 * within a round trip.
 */

export type SyncPhase = 'idle' | 'busy' | 'join' | 'lobby' | 'cooking' | 'error';
export type Role = 'host' | 'guest';
export type Agreement = 'unchecked' | 'same' | 'different';

const RESUME_KEY = 'kc.session';
type Resume = { id: string; role: Role };

/** Which session this tab is in, so a phone that reloads mid-cook lands back in it. */
const readResume = (): Resume | null => {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Resume>) : null;
    return parsed?.id && (parsed.role === 'host' || parsed.role === 'guest')
      ? { id: parsed.id, role: parsed.role }
      : null;
  } catch {
    return null;
  }
};
const writeResume = (resume: Resume | null): void => {
  try {
    if (resume) sessionStorage.setItem(RESUME_KEY, JSON.stringify(resume));
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // No storage, no resume. Everything else still works.
  }
};

/**
 * Every route this store calls exists only on a server that keeps sessions — one with a
 * database. A server without one answers `not_found` for all of them, which is a fact about
 * the server, not a broken link, and is said as such.
 */
const NO_SESSIONS =
  'This server cannot keep a shared session; it has no database behind it. Cooking together ' +
  'works against an API that has one — locally, that is `docker compose up` and the API ' +
  'started with DATABASE_URL set.';

const describe = (err: unknown): string => {
  if (isApiError(err, 'not_found')) return NO_SESSIONS;
  return err instanceof ApiRequestError || err instanceof Error ? err.message : 'Something went wrong.';
};

/** Failures after which there is no session left to be in. */
const isGone = (err: unknown): boolean =>
  isApiError(err, 'session_not_found') ||
  isApiError(err, 'session_expired') ||
  isApiError(err, 'unauthorized');

/** The same, plus being told this device is not in the session any more. */
const isFatal = (err: unknown): boolean => isGone(err) || isApiError(err, 'forbidden');

export type SyncState = {
  phase: SyncPhase;
  role: Role;
  session: SessionView | null;
  /** This device's own compile of the session's inputs. Null until it has run. */
  outcome: CompileOutcome | null;
  /** Whether that compile hashes to what the host compiled. */
  agreement: Agreement;
  deviceId: string | null;
  /** What the join screen is showing or was opened with. */
  joinCode: string;
  events: SessionEvent[];
  lastSeq: number;
  /** Task ids finished, from the log plus any tap not yet acknowledged. */
  completed: string[];
  pendingCompletions: string[];
  startedAtMs: number | null;
  clockOffsetMs: number;
  /** A request the user asked for is out. */
  pending: boolean;
  /** The last poll failed to reach the server. Cleared by the next one that does. */
  offline: boolean;
  /** Something the user did failed, in words they can act on. */
  error: string | null;

  /** The server's idea of now, on this device's clock. */
  now: () => number;
  host: (intake: IntakeAnswers, compiled: Extract<CompileOutcome, { ok: true }>) => Promise<void>;
  openJoin: (code: string) => void;
  lookUp: (code: string) => Promise<void>;
  claim: (cookId: string, displayName: string) => Promise<void>;
  start: () => Promise<void>;
  complete: (taskId: string) => Promise<void>;
  poll: () => Promise<void>;
  resume: () => Promise<void>;
  leave: () => void;
  dismissError: () => void;
};

const initial = {
  phase: 'idle' as SyncPhase,
  role: 'guest' as Role,
  session: null,
  outcome: null,
  agreement: 'unchecked' as Agreement,
  deviceId: null,
  joinCode: '',
  events: [],
  lastSeq: 0,
  completed: [],
  pendingCompletions: [],
  startedAtMs: null,
  clockOffsetMs: 0,
  pending: false,
  offline: false,
  error: null,
};

const cleanCode = (code: string): string => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const useSync = create<SyncState>((set, get) => {
  /** Take a fresh view of the session on board, and compile it if this device has not. */
  const absorb = (view: SessionView, sentAtMs: number, receivedAtMs: number, deviceId: string) => {
    const have = get().outcome;
    const outcome = have ?? compileSession(view.inputs);
    const agreement: Agreement =
      outcome.ok && contentHash(outcome.schedule) === view.scheduleHash ? 'same' : 'different';
    const mine = view.members.find((m) => m.deviceId === deviceId);
    const role: Role = view.hostDeviceId === deviceId ? 'host' : 'guest';
    const phase: SyncPhase =
      mine || role === 'host' ? (view.status === 'cooking' ? 'cooking' : 'lobby') : 'join';
    writeResume({ id: view.id, role });
    set({
      deviceId,
      role,
      session: view,
      outcome,
      agreement,
      startedAtMs: view.startedAtMs,
      clockOffsetMs: offsetFrom(view.serverTimeMs, sentAtMs, receivedAtMs),
      phase,
      pending: false,
      error: null,
    });
  };

  return {
    ...initial,

    now: () => Date.now() + get().clockOffsetMs,

    host: async (intake, compiled) => {
      set({ ...initial, phase: 'busy', role: 'host', outcome: compiled, pending: true });
      try {
        const device = await ensureDevice();
        const sent = Date.now();
        const view = await api.createSession({
          inputs: intake,
          crew: compiled.constraints.cooks,
          scheduleHash: contentHash(compiled.schedule),
          schedulerVersion: SCHEDULER_VERSION,
        });
        absorb(view, sent, Date.now(), device.deviceId);
      } catch (err) {
        set({ phase: 'error', error: describe(err), pending: false });
      }
    },

    openJoin: (code) => {
      const clean = cleanCode(code);
      set({ ...initial, phase: 'join', role: 'guest', joinCode: clean });
      if (clean.length === 6) void get().lookUp(clean);
    },

    lookUp: async (code) => {
      const clean = cleanCode(code);
      set({ joinCode: clean, pending: true, error: null });
      try {
        const device = await ensureDevice();
        const sent = Date.now();
        const view = await api.sessionByCode(clean);
        set({ outcome: null });
        absorb(view, sent, Date.now(), device.deviceId);
        void get().poll();
      } catch (err) {
        set({ pending: false, error: describe(err) });
      }
    },

    claim: async (cookId, displayName) => {
      const { session, deviceId } = get();
      if (!session || !deviceId) return;
      set({ pending: true, error: null });
      try {
        const sent = Date.now();
        const view = await api.joinSession(session.id, { cookId, displayName: displayName.trim() });
        absorb(view, sent, Date.now(), deviceId);
        void get().poll();
      } catch (err) {
        set({ pending: false, error: describe(err), ...(isFatal(err) ? { phase: 'error' } : {}) });
      }
    },

    start: async () => {
      const { session } = get();
      if (!session) return;
      set({ pending: true, error: null });
      try {
        const sent = Date.now();
        const { event, serverTimeMs } = await api.append(session.id, { type: 'session-started' });
        const startedAtMs = Number(event.payload['startedAtMs'] ?? serverTimeMs);
        set((s) => ({
          pending: false,
          startedAtMs,
          phase: 'cooking',
          clockOffsetMs: offsetFrom(serverTimeMs, sent, Date.now()),
          session: s.session ? { ...s.session, status: 'cooking', startedAtMs } : s.session,
          events: merge(s.events, [event]),
          lastSeq: Math.max(s.lastSeq, event.seq),
        }));
      } catch (err) {
        set({ pending: false, error: describe(err), ...(isGone(err) ? { phase: 'error' } : {}) });
      }
    },

    /**
     * Finishing is optimistic: the slide moves on the instant the button is tapped, because
     * a cook with wet hands does not wait for a round trip. The tap is then written to the
     * log; if that fails, it is taken back and said so.
     */
    complete: async (taskId) => {
      const { session, completed, pendingCompletions } = get();
      if (!session || completed.includes(taskId)) return;
      set({
        completed: [...completed, taskId],
        pendingCompletions: [...pendingCompletions, taskId],
        error: null,
      });
      try {
        const sent = Date.now();
        const { event, serverTimeMs } = await api.append(session.id, { type: 'task-completed', taskId });
        set((s) => {
          const events = merge(s.events, [event]);
          const pendingLeft = s.pendingCompletions.filter((id) => id !== taskId);
          return {
            events,
            lastSeq: Math.max(s.lastSeq, event.seq),
            pendingCompletions: pendingLeft,
            completed: [...new Set([...completedFrom(events), ...pendingLeft])],
            clockOffsetMs: offsetFrom(serverTimeMs, sent, Date.now()),
          };
        });
      } catch (err) {
        set((s) => {
          const pendingLeft = s.pendingCompletions.filter((id) => id !== taskId);
          return {
            pendingCompletions: pendingLeft,
            completed: [...new Set([...completedFrom(s.events), ...pendingLeft])],
            error: `Could not save that as done: ${describe(err)}`,
            ...(isFatal(err) ? { phase: 'error' as const } : {}),
          };
        });
      }
    },

    poll: async () => {
      const { session, lastSeq, phase } = get();
      // Only the lobby and the kitchen have a log to follow; a phone still choosing a cook
      // is not yet a member and would be refused.
      if (!session || (phase !== 'lobby' && phase !== 'cooking')) return;
      try {
        const sent = Date.now();
        const res = await api.events(session.id, lastSeq);
        const received = Date.now();
        set((s) => {
          if (!s.session || s.session.id !== session.id) return {};
          const events = merge(s.events, res.events);
          const nextPhase: SyncPhase =
            res.status === 'cooking' && s.phase === 'lobby' ? 'cooking' : s.phase;
          return {
            events,
            lastSeq: Math.max(s.lastSeq, res.lastSeq),
            completed: [...new Set([...completedFrom(events), ...s.pendingCompletions])],
            startedAtMs: res.startedAtMs,
            clockOffsetMs: offsetFrom(res.serverTimeMs, sent, received),
            session: {
              ...s.session,
              members: res.members,
              status: res.status,
              startedAtMs: res.startedAtMs,
              lastSeq: res.lastSeq,
            },
            phase: nextPhase,
            offline: false,
          };
        });
      } catch (err) {
        if (isFatal(err)) {
          writeResume(null);
          set({ phase: 'error', error: describe(err) });
        } else {
          set({ offline: true });
        }
      }
    },

    resume: async () => {
      const remembered = readResume();
      if (!remembered) return;
      set({ ...initial, phase: 'busy', role: remembered.role });
      try {
        const device = await ensureDevice();
        const sent = Date.now();
        const view = await api.getSession(remembered.id);
        absorb(view, sent, Date.now(), device.deviceId);
        void get().poll();
      } catch {
        // The session is gone, or this device is not in it any more. Back to the start.
        writeResume(null);
        set({ ...initial });
      }
    },

    leave: () => {
      writeResume(null);
      set({ ...initial });
    },

    dismissError: () => set({ error: null }),
  };
});

/** The log, with newcomers folded in by sequence number and duplicates dropped. */
const merge = (have: SessionEvent[], incoming: SessionEvent[]): SessionEvent[] => {
  const bySeq = new Map(have.map((e) => [e.seq, e]));
  for (const e of incoming) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
};

/** The member this device is, if it has claimed a cook. */
export const selectMe = (s: SyncState) =>
  s.session && s.deviceId ? (s.session.members.find((m) => m.deviceId === s.deviceId) ?? null) : null;

/** The compiled session every screen in the shared flow draws from. Null if this device could not compile it. */
export const selectCompiled = (s: SyncState) => (s.outcome?.ok ? s.outcome : null);
