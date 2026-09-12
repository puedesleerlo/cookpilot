import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '@kitchen/domain';
import type { SessionEvent, SessionMember, SessionView } from '@kitchen/contracts';
import { forgetDevice } from './api';
import { compileSession } from './compile';
import { demoIntake } from './demo';
import { useSync } from './sync';

/**
 * The client's side of the sync protocol, against a fake server small enough to read.
 *
 * The fake holds exactly what the real one holds — inputs, crew, roster, an ordered log —
 * and nothing derived. The interesting assertions are about what the store does with the
 * answers: that it compiles for itself and checks the hash, that a tap shows before the
 * server has agreed to it, that the clock is the server's, and that losing the server for a
 * poll is not the same as losing the session.
 */

const compiled = compileSession(demoIntake());
if (!compiled.ok) throw new Error(compiled.reason);

type FakeSession = {
  view: Omit<SessionView, 'members' | 'lastSeq' | 'serverTimeMs' | 'startedAtMs' | 'status'>;
  members: SessionMember[];
  events: SessionEvent[];
  status: SessionView['status'];
  startedAtMs: number | null;
};

class FakeServer {
  sessions = new Map<string, FakeSession>();
  tokens = new Map<string, string>();
  issued = 0;
  /** How far ahead of this machine the server's clock runs. */
  skewMs = 0;
  /** Fail every request until reset. */
  down = false;
  /** Answer the next authenticated request with 401 once, as a reset database would. */
  rejectNextToken = false;
  calls: string[] = [];

  now(): number {
    return Date.now() + this.skewMs;
  }

  install(): void {
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => this.handle(String(input), init));
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  private error(status: number, code: string, message = code): Response {
    return this.json(status, { error: { code, message, requestId: 'req' } });
  }

  private viewOf(s: FakeSession): SessionView {
    return {
      ...s.view,
      status: s.status,
      startedAtMs: s.startedAtMs,
      members: s.members,
      lastSeq: s.events.length,
      serverTimeMs: this.now(),
    };
  }

  private append(s: FakeSession, type: SessionEvent['type'], taskId: string | null, byDeviceId: string, payload = {}): SessionEvent {
    const event: SessionEvent = {
      id: `ev_${s.events.length + 1}`,
      seq: s.events.length + 1,
      type,
      taskId,
      payload,
      byDeviceId,
      atMs: this.now(),
    };
    s.events.push(event);
    return event;
  }

  async handle(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? 'GET';
    const parsed = new URL(url, 'http://fake');
    const path = parsed.pathname;
    const query = parsed.searchParams;
    this.calls.push(`${method} ${path}${parsed.search}`);
    if (this.down) throw new TypeError('Failed to fetch');
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    if (method === 'POST' && path === '/v1/devices') {
      this.issued++;
      const deviceId = `dev_${this.issued}`;
      const token = `tok_${this.issued}`;
      this.tokens.set(token, deviceId);
      return this.json(201, { deviceId, token, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    }

    const header = new Headers(init?.headers).get('authorization') ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    if (this.rejectNextToken) {
      this.rejectNextToken = false;
      return this.error(401, 'unauthorized');
    }
    const deviceId = this.tokens.get(token);
    if (!deviceId) return this.error(401, 'unauthorized');

    if (method === 'POST' && path === '/v1/sessions') {
      const id = `sess_${this.sessions.size + 1}`;
      const s: FakeSession = {
        view: {
          id,
          joinCode: `CODE${this.sessions.size + 2}${this.sessions.size + 3}`.slice(0, 6),
          hostDeviceId: deviceId,
          inputs: body['inputs'] as SessionView['inputs'],
          crew: body['crew'] as SessionView['crew'],
          scheduleHash: body['scheduleHash'] as string,
          schedulerVersion: body['schedulerVersion'] as string,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        members: [],
        events: [],
        status: 'open',
        startedAtMs: null,
      };
      this.sessions.set(id, s);
      return this.json(201, this.viewOf(s));
    }

    const byCode = /^\/v1\/sessions\/by-code\/([^/]+)$/.exec(path);
    if (method === 'GET' && byCode) {
      const s = [...this.sessions.values()].find((x) => x.view.joinCode === byCode[1]);
      return s ? this.json(200, this.viewOf(s)) : this.error(404, 'join_code_invalid', 'No session has that code.');
    }

    const m = /^\/v1\/sessions\/([^/]+)(?:\/(join|events))?$/.exec(path);
    if (!m) return this.error(404, 'not_found');
    const s = this.sessions.get(m[1]!);
    if (!s) return this.error(404, 'session_not_found', 'That session does not exist.');
    if (Date.parse(s.view.expiresAt) <= Date.now()) return this.error(410, 'session_expired', 'That session has expired.');
    const isHost = s.view.hostDeviceId === deviceId;
    const isMember = s.members.some((x) => x.deviceId === deviceId);

    if (method === 'GET' && m[2] === undefined) {
      return isHost || isMember ? this.json(200, this.viewOf(s)) : this.error(403, 'forbidden');
    }

    if (method === 'POST' && m[2] === 'join') {
      const cookId = String(body['cookId']);
      const holder = s.members.find((x) => x.cookId === cookId && x.deviceId !== deviceId);
      if (holder) return this.error(409, 'conflict', `${holder.displayName} already took that one.`);
      s.members = s.members.filter((x) => x.deviceId !== deviceId);
      s.members.push({ deviceId, cookId, displayName: String(body['displayName']), isHost });
      this.append(s, 'member-joined', null, deviceId, { cookId });
      return this.json(200, this.viewOf(s));
    }

    if (!isHost && !isMember) return this.error(403, 'forbidden');

    if (method === 'GET' && m[2] === 'events') {
      const after = Number(query.get('after') ?? 0);
      return this.json(200, {
        events: s.events.filter((e) => e.seq > after),
        lastSeq: s.events.length,
        status: s.status,
        startedAtMs: s.startedAtMs,
        members: s.members,
        serverTimeMs: this.now(),
      });
    }

    if (method === 'POST' && m[2] === 'events') {
      if (body['type'] === 'session-started') {
        if (!isHost) return this.error(403, 'forbidden', 'Only whoever started the session can change the plan.');
        if (s.status !== 'open') return this.error(409, 'conflict');
        s.status = 'cooking';
        s.startedAtMs = this.now();
        const event = this.append(s, 'session-started', null, deviceId, { startedAtMs: s.startedAtMs });
        return this.json(201, { event, serverTimeMs: this.now() });
      }
      if (s.status !== 'cooking') return this.error(409, 'conflict', 'Not started.');
      const event = this.append(s, 'task-completed', String(body['taskId']), deviceId);
      return this.json(201, { event, serverTimeMs: this.now() });
    }

    return this.error(404, 'not_found');
  }

  /** The host pressing start from another device. */
  startFromElsewhere(id: string): void {
    const s = this.sessions.get(id)!;
    s.status = 'cooking';
    s.startedAtMs = this.now();
    this.append(s, 'session-started', null, s.view.hostDeviceId, { startedAtMs: s.startedAtMs });
  }

  /** Another cook finishing something. */
  finishFromElsewhere(id: string, taskId: string): void {
    const s = this.sessions.get(id)!;
    this.append(s, 'task-completed', taskId, 'dev_other');
  }
}

let server: FakeServer;

/** A different phone: same app, fresh identity. */
const anotherDevice = () => {
  forgetDevice();
  sessionStorage.clear();
};

beforeEach(() => {
  server = new FakeServer();
  server.install();
  localStorage.clear();
  sessionStorage.clear();
  useSync.getState().leave();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const state = () => useSync.getState();

const hostIt = async () => {
  await state().host(demoIntake(), compiled);
  const session = state().session;
  if (!session) throw new Error(state().error ?? 'no session');
  return session;
};

describe('hosting', () => {
  it('opens a session from the compiled timeline and lands in the lobby as host', async () => {
    const session = await hostIt();
    expect(state().phase).toBe('lobby');
    expect(state().role).toBe('host');
    expect(state().agreement).toBe('same');
    expect(session.scheduleHash).toBe(contentHash(compiled.schedule));
    expect(session.crew.map((c) => c.id)).toEqual(compiled.constraints.cooks.map((c) => c.id));
    expect(session.inputs.pantry.length).toBe(demoIntake().pantry.length);
    // Identity was issued once and kept.
    expect(server.calls.filter((c) => c === 'POST /v1/devices')).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem('kc.session') ?? '{}')).toMatchObject({ id: session.id, role: 'host' });
  });

  it('says so, rather than hanging, when the server cannot be reached', async () => {
    server.down = true;
    await state().host(demoIntake(), compiled);
    expect(state().phase).toBe('error');
    expect(state().error).toMatch(/Could not reach/);
  });

  it('measures the server clock rather than trusting its own', async () => {
    server.skewMs = 5_000;
    await hostIt();
    expect(state().clockOffsetMs).toBeGreaterThan(4_900);
    expect(state().clockOffsetMs).toBeLessThan(5_100);
    expect(state().now() - Date.now()).toBeGreaterThan(4_900);
  });
});

describe('joining from a phone', () => {
  it('finds the session by code, compiles it for itself and agrees with the host', async () => {
    const hosted = await hostIt();
    anotherDevice();

    state().openJoin(hosted.joinCode.toLowerCase());
    await vi.waitFor(() => expect(state().session?.id).toBe(hosted.id));
    expect(state().phase).toBe('join');
    expect(state().role).toBe('guest');
    expect(state().outcome?.ok).toBe(true);
    expect(state().agreement).toBe('same');
    expect(state().deviceId).toBe('dev_2');
  });

  it('disagrees out loud when the host compiled something else', async () => {
    const hosted = await hostIt();
    server.sessions.get(hosted.id)!.view.scheduleHash = 'fnv1a-00000000';
    anotherDevice();
    await state().lookUp(hosted.joinCode);
    expect(state().agreement).toBe('different');
  });

  it('reports a code nobody has', async () => {
    await state().lookUp('ZZZZZZ');
    expect(state().phase).toBe('idle');
    expect(state().error).toMatch(/No session has that code/);
  });

  it('claims a cook and waits in the lobby', async () => {
    const hosted = await hostIt();
    anotherDevice();
    await state().lookUp(hosted.joinCode);
    await state().claim(hosted.crew[1]!.id, '  Ben ');
    expect(state().phase).toBe('lobby');
    expect(state().session?.members).toEqual([
      { deviceId: 'dev_2', cookId: hosted.crew[1]!.id, displayName: 'Ben', isHost: false },
    ]);
    expect(JSON.parse(sessionStorage.getItem('kc.session') ?? '{}')).toMatchObject({ id: hosted.id, role: 'guest' });
  });

  it('is told when the cook it wanted is taken, and stays on the join screen', async () => {
    const hosted = await hostIt();
    await state().claim(hosted.crew[0]!.id, 'Ana');
    anotherDevice();
    await state().lookUp(hosted.joinCode);
    await state().claim(hosted.crew[0]!.id, 'Ben');
    expect(state().phase).toBe('join');
    expect(state().error).toMatch(/Ana already took/);
  });

  it('flips to cooking when the host starts, on the next poll', async () => {
    const hosted = await hostIt();
    anotherDevice();
    await state().lookUp(hosted.joinCode);
    await state().claim(hosted.crew[1]!.id, 'Ben');
    expect(state().phase).toBe('lobby');

    server.startFromElsewhere(hosted.id);
    await state().poll();
    expect(state().phase).toBe('cooking');
    expect(state().startedAtMs).toBe(server.sessions.get(hosted.id)!.startedAtMs);
    expect(state().events.map((e) => e.type)).toEqual(['member-joined', 'session-started']);
  });

  it('cannot start the session itself', async () => {
    const hosted = await hostIt();
    anotherDevice();
    await state().lookUp(hosted.joinCode);
    await state().claim(hosted.crew[1]!.id, 'Ben');
    await state().start();
    expect(state().phase).toBe('lobby');
    expect(state().error).toMatch(/Only whoever started/);
  });
});

describe('cooking', () => {
  const taskId = () => {
    const first = compiled.schedule.scheduled.find((s) => s.cookId === compiled.constraints.cooks[0]!.id);
    return first!.taskId;
  };

  it('starts, as host, and anchors the countdown to the server’s clock', async () => {
    server.skewMs = -3_000;
    await hostIt();
    await state().start();
    expect(state().phase).toBe('cooking');
    expect(state().session?.status).toBe('cooking');
    expect(state().startedAtMs).toBeLessThanOrEqual(Date.now() - 2_900);
  });

  it('shows a tap as done immediately, then writes it to the log', async () => {
    const hosted = await hostIt();
    await state().start();
    const id = taskId();

    const promise = state().complete(id);
    expect(state().completed).toContain(id);
    expect(state().events.some((e) => e.taskId === id)).toBe(false);
    await promise;
    expect(state().events.find((e) => e.taskId === id)?.type).toBe('task-completed');
    expect(state().completed).toContain(id);
    expect(state().pendingCompletions).toEqual([]);
    expect(server.sessions.get(hosted.id)!.events.at(-1)?.taskId).toBe(id);
  });

  it('takes a tap back if the server refuses it', async () => {
    await hostIt();
    await state().start();
    const id = taskId();
    server.down = true;
    await state().complete(id);
    expect(state().completed).not.toContain(id);
    expect(state().error).toMatch(/Could not save/);
  });

  it('folds in what other cooks finished, in order, from where it left off', async () => {
    const hosted = await hostIt();
    await state().start();
    await state().poll();
    const seen = state().lastSeq;
    server.finishFromElsewhere(hosted.id, 'task:x');
    server.finishFromElsewhere(hosted.id, 'task:y');
    await state().poll();
    expect(state().completed).toEqual(expect.arrayContaining(['task:x', 'task:y']));
    expect(state().lastSeq).toBe(seen + 2);
    expect(server.calls.at(-1)).toContain(`after=${seen}`);
    // Polling again asks for nothing it already has.
    await state().poll();
    expect(server.calls.at(-1)).toContain(`after=${seen + 2}`);
  });

  it('marks itself offline on a failed poll and back online on the next good one', async () => {
    await hostIt();
    server.down = true;
    await state().poll();
    expect(state().offline).toBe(true);
    expect(state().phase).toBe('lobby');
    server.down = false;
    await state().poll();
    expect(state().offline).toBe(false);
  });

  it('gives up the session, not just the poll, when the server says it is gone', async () => {
    const hosted = await hostIt();
    server.sessions.get(hosted.id)!.view.expiresAt = new Date(Date.now() - 1).toISOString();
    await state().poll();
    expect(state().phase).toBe('error');
    expect(state().error).toMatch(/expired/);
    expect(sessionStorage.getItem('kc.session')).toBeNull();
  });
});

describe('identity and resuming', () => {
  it('re-issues a device the server no longer recognises, once, and carries on', async () => {
    await hostIt();
    server.rejectNextToken = true;
    await state().poll();
    expect(state().offline).toBe(false);
    expect(server.calls.filter((c) => c === 'POST /v1/devices')).toHaveLength(2);
  });

  it('lands a reloaded tab back in its session', async () => {
    const hosted = await hostIt();
    await state().start();
    // A reload: the store is fresh, the tab's storage is not.
    useSync.setState({ phase: 'idle', session: null, outcome: null, events: [], lastSeq: 0 });
    await state().resume();
    expect(state().phase).toBe('cooking');
    expect(state().session?.id).toBe(hosted.id);
    expect(state().role).toBe('host');
    expect(state().outcome?.ok).toBe(true);
  });

  it('does nothing on a plain load', async () => {
    await state().resume();
    expect(state().phase).toBe('idle');
    expect(server.calls).toEqual([]);
  });

  it('leaves cleanly', async () => {
    await hostIt();
    state().leave();
    expect(state().phase).toBe('idle');
    expect(state().session).toBeNull();
    expect(sessionStorage.getItem('kc.session')).toBeNull();
  });
});
