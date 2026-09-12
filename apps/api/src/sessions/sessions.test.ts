// @vitest-environment node
/**
 * Shared sessions, driven the way two phones and a laptop drive them.
 *
 * Against a real Postgres, because the two things worth proving are database behaviours:
 * a cook can be claimed by one device at a time even when two tap at once, and the log
 * every device replays has one order. Skipped, loudly, without a database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  ErrorBodySchema,
  JOIN_CODE_ALPHABET_RE,
  SessionEventsResponseSchema,
  SessionViewSchema,
  type CreateSessionRequest,
} from '@kitchen/contracts';
import { aCook, aHelper, anIngredient } from '@kitchen/domain/testing';
import { createDb, type DbHandle } from '../db/client';
import { runMigrations } from '../db/migrate';
import { sessions } from '../db/schema';
import { issueDevice } from '../auth/devices';
import { buildServer } from '../server';
import { parseEnv } from '../config/env';
import { SESSION_TTL_MS } from './routes';

const DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgresql://kc:kc@localhost:55432/kc';
// scan-secrets-ignore: a test signing key, never used anywhere real
const SECRET = 'test-signing-key-at-least-32-chars-long';
const T0 = 1_789_000_000_000;

let handle: DbHandle | null = null;
let app: FastifyInstance | null = null;
let reachable = false;
let clock = T0;

beforeAll(async () => {
  try {
    handle = createDb(DATABASE_URL, { max: 4 });
    await handle.db.execute(sql`SELECT 1`);
    await runMigrations(DATABASE_URL);
    reachable = true;
  } catch {
    reachable = false;
    await handle?.close().catch(() => {});
    handle = null;
    console.warn('\n  [sessions.test] Postgres unreachable — integration tests skipped.\n');
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
  await handle?.close();
});

const dbIt = (name: string, fn: () => Promise<void>, timeout?: number) =>
  it(name, async () => {
    if (!reachable) return;
    await fn();
  }, timeout);

const db = () => handle!.db;

const start = async (random?: () => number) => {
  await app?.close();
  app = await buildServer({
    env: parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    db: db(),
    jwtSecret: SECRET,
    now: () => clock,
    ...(random ? { random } : {}),
  });
  return app;
};

beforeEach(async () => {
  if (!reachable) return;
  clock = T0;
  await db().execute(sql`TRUNCATE session_events, schedules, session_members, sessions, devices CASCADE`);
});

const stated = <T>(value: T) => ({ value, source: 'stated' as const });

const crew = [aCook({ name: 'Cook 1' }), aHelper({ name: 'Cook 2' })];

const createBody = (): CreateSessionRequest => ({
  inputs: {
    pantry: [anIngredient(), anIngredient({ canonicalName: 'bok choy', name: 'bok choy', category: 'produce' })],
    timeBudgetMin: stated(60),
    servings: stated(4),
    mealCount: stated(3),
    cookCount: stated(2),
    equipment: stated([{ kind: 'burner', count: 2 }]),
    restrictions: stated([]),
    style: stated('asian'),
    wantsBeverages: stated(true),
  },
  crew,
  scheduleHash: 'fnv1a-deadbeef',
  schedulerVersion: '0.3.0',
});

type Actor = { token: string; deviceId: string };
const auth = (a: Actor) => ({ authorization: `Bearer ${a.token}` });

const actors = async () => ({
  host: await issueDevice(db(), SECRET),
  ana: await issueDevice(db(), SECRET),
  ben: await issueDevice(db(), SECRET),
  stranger: await issueDevice(db(), SECRET),
});

const host = async (server: FastifyInstance, who: Actor) => {
  const res = await server.inject({
    method: 'POST',
    url: '/v1/sessions',
    headers: auth(who),
    payload: createBody(),
  });
  expect(res.statusCode).toBe(201);
  return SessionViewSchema.parse(res.json());
};

const join = async (server: FastifyInstance, id: string, who: Actor, cookId: string, displayName: string) =>
  await server.inject({
    method: 'POST',
    url: `/v1/sessions/${id}/join`,
    headers: auth(who),
    payload: { cookId, displayName },
  });

const append = async (server: FastifyInstance, id: string, who: Actor, payload: Record<string, unknown>) =>
  await server.inject({ method: 'POST', url: `/v1/sessions/${id}/events`, headers: auth(who), payload });

const replay = async (server: FastifyInstance, id: string, who: Actor, after = 0) => {
  const res = await server.inject({
    method: 'GET',
    url: `/v1/sessions/${id}/events?after=${after}`,
    headers: auth(who),
  });
  expect(res.statusCode).toBe(200);
  return SessionEventsResponseSchema.parse(res.json());
};

const code = (res: { json: () => unknown }) => ErrorBodySchema.parse(res.json()).error.code;

describe('opening a session', () => {
  dbIt('returns a six-character code, an empty roster and the hash the host compiled', async () => {
    const server = await start();
    const { host: h } = await actors();
    const view = await host(server, h);

    expect(view.joinCode).toMatch(JOIN_CODE_ALPHABET_RE);
    expect(view.status).toBe('open');
    expect(view.hostDeviceId).toBe(h.deviceId);
    expect(view.members).toEqual([]);
    expect(view.startedAtMs).toBeNull();
    expect(view.scheduleHash).toBe('fnv1a-deadbeef');
    expect(view.crew.map((c) => c.id)).toEqual(crew.map((c) => c.id));
    expect(view.serverTimeMs).toBe(T0);
    expect(Date.parse(view.expiresAt)).toBe(T0 + SESSION_TTL_MS);
  });

  dbIt('needs a device', async () => {
    const server = await start();
    const res = await server.inject({ method: 'POST', url: '/v1/sessions', payload: createBody() });
    expect(res.statusCode).toBe(401);
  });

  dbIt('rejects inputs that are not a session, naming the field', async () => {
    const server = await start();
    const { host: h } = await actors();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/sessions',
      headers: auth(h),
      payload: { ...createBody(), inputs: { pantry: [] } },
    });
    expect(res.statusCode).toBe(400);
    const body = ErrorBodySchema.parse(res.json());
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.details?.some((d) => d.path.startsWith('inputs'))).toBe(true);
  });

  dbIt('retries the join code when it collides, rather than failing the host', async () => {
    // A generator that returns the same code twice, then moves on.
    let calls = 0;
    const server = await start(() => {
      calls++;
      return calls <= 12 ? 0.1 : 0.9;
    });
    const { host: h, ana } = await actors();
    const first = await host(server, h);
    const second = await host(server, ana);
    expect(second.joinCode).not.toBe(first.joinCode);
  });
});

describe('finding a session by its code', () => {
  dbIt('is case-insensitive, because people type codes off a screen across a kitchen', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);
    const res = await server.inject({
      method: 'GET',
      url: `/v1/sessions/by-code/${view.joinCode.toLowerCase()}`,
      headers: auth(ana),
    });
    expect(res.statusCode).toBe(200);
    expect(SessionViewSchema.parse(res.json()).id).toBe(view.id);
  });

  dbIt('says so when no session has that code', async () => {
    const server = await start();
    const { ana } = await actors();
    const res = await server.inject({ method: 'GET', url: '/v1/sessions/by-code/ZZZZZZ', headers: auth(ana) });
    expect(res.statusCode).toBe(404);
    expect(code(res)).toBe('join_code_invalid');
  });

  dbIt('refuses a session that has expired', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);
    clock = T0 + SESSION_TTL_MS + 1;
    const res = await server.inject({ method: 'GET', url: `/v1/sessions/by-code/${view.joinCode}`, headers: auth(ana) });
    expect(res.statusCode).toBe(410);
    expect(code(res)).toBe('session_expired');
  });
});

describe('claiming a cook', () => {
  dbIt('puts the device on the roster as that cook, and in the log', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);

    const res = await join(server, view.id, ana, crew[0]!.id, 'Ana');
    expect(res.statusCode).toBe(200);
    const after = SessionViewSchema.parse(res.json());
    expect(after.members).toEqual([
      { deviceId: ana.deviceId, cookId: crew[0]!.id, displayName: 'Ana', isHost: false },
    ]);

    const log = await replay(server, view.id, ana);
    expect(log.events.map((e) => [e.seq, e.type])).toEqual([[1, 'member-joined']]);
    expect(log.events[0]!.payload).toEqual({ cookId: crew[0]!.id, displayName: 'Ana' });
  });

  dbIt('refuses a cook someone else already holds, and says who', async () => {
    const server = await start();
    const { host: h, ana, ben } = await actors();
    const view = await host(server, h);
    await join(server, view.id, ana, crew[0]!.id, 'Ana');

    const res = await join(server, view.id, ben, crew[0]!.id, 'Ben');
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('conflict');
    expect(ErrorBodySchema.parse(res.json()).error.message).toContain('Ana');
  });

  dbIt('gives one cook to one device when two tap it at the same instant', async () => {
    const server = await start();
    const { host: h, ana, ben } = await actors();
    const view = await host(server, h);

    const results = await Promise.all([
      join(server, view.id, ana, crew[1]!.id, 'Ana'),
      join(server, view.id, ben, crew[1]!.id, 'Ben'),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  dbIt('moves a device that changes its mind rather than listing it twice', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);
    await join(server, view.id, ana, crew[0]!.id, 'Ana');
    const res = await join(server, view.id, ana, crew[1]!.id, 'Ana');
    expect(res.statusCode).toBe(200);
    const after = SessionViewSchema.parse(res.json());
    expect(after.members).toHaveLength(1);
    expect(after.members[0]!.cookId).toBe(crew[1]!.id);
  });

  dbIt('refuses a cook that is not in the crew', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);
    const res = await join(server, view.id, ana, 'cook:nobody', 'Ana');
    expect(res.statusCode).toBe(400);
    expect(ErrorBodySchema.parse(res.json()).error.details?.[0]?.path).toBe('cookId');
  });

  dbIt('lets the host claim a cook too', async () => {
    const server = await start();
    const { host: h } = await actors();
    const view = await host(server, h);
    const res = await join(server, view.id, h, crew[0]!.id, 'Sam');
    expect(res.statusCode).toBe(200);
    expect(SessionViewSchema.parse(res.json()).members[0]).toMatchObject({ isHost: true, displayName: 'Sam' });
  });
});

describe('who may see a session', () => {
  dbIt('lets the host and members read it, and nobody else', async () => {
    const server = await start();
    const { host: h, ana, stranger } = await actors();
    const view = await host(server, h);
    await join(server, view.id, ana, crew[0]!.id, 'Ana');

    for (const who of [h, ana]) {
      const res = await server.inject({ method: 'GET', url: `/v1/sessions/${view.id}`, headers: auth(who) });
      expect(res.statusCode).toBe(200);
    }
    const res = await server.inject({ method: 'GET', url: `/v1/sessions/${view.id}`, headers: auth(stranger) });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('forbidden');
  });

  dbIt('reports a session that does not exist as such', async () => {
    const server = await start();
    const { ana } = await actors();
    const res = await server.inject({ method: 'GET', url: '/v1/sessions/sess_nope', headers: auth(ana) });
    expect(res.statusCode).toBe(404);
    expect(code(res)).toBe('session_not_found');
  });
});

describe('starting to cook', () => {
  dbIt('is the host’s call, and only the host’s', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);
    await join(server, view.id, ana, crew[0]!.id, 'Ana');

    const refused = await append(server, view.id, ana, { type: 'session-started' });
    expect(refused.statusCode).toBe(403);

    clock = T0 + 90_000;
    const started = await append(server, view.id, h, { type: 'session-started' });
    expect(started.statusCode).toBe(201);
    expect(started.json().event).toMatchObject({ seq: 2, type: 'session-started', payload: { startedAtMs: T0 + 90_000 } });

    const log = await replay(server, view.id, ana);
    expect(log.status).toBe('cooking');
    expect(log.startedAtMs).toBe(T0 + 90_000);
  });

  dbIt('happens once', async () => {
    const server = await start();
    const { host: h } = await actors();
    const view = await host(server, h);
    expect((await append(server, view.id, h, { type: 'session-started' })).statusCode).toBe(201);
    const again = await append(server, view.id, h, { type: 'session-started' });
    expect(again.statusCode).toBe(409);
  });

  dbIt('does not accept a finished task before it has begun', async () => {
    const server = await start();
    const { host: h, ana } = await actors();
    const view = await host(server, h);
    await join(server, view.id, ana, crew[0]!.id, 'Ana');
    const res = await append(server, view.id, ana, { type: 'task-completed', taskId: 'task:rice:cook:start' });
    expect(res.statusCode).toBe(409);
  });
});

describe('the log', () => {
  dbIt('replays in one order, from where each device left off', async () => {
    const server = await start();
    const { host: h, ana, ben } = await actors();
    const view = await host(server, h);
    await join(server, view.id, ana, crew[0]!.id, 'Ana'); // seq 1
    await join(server, view.id, ben, crew[1]!.id, 'Ben'); // seq 2
    await append(server, view.id, h, { type: 'session-started' }); // seq 3

    const anaSees = await replay(server, view.id, ana);
    expect(anaSees.lastSeq).toBe(3);

    // Both cooks finish something at the same moment.
    await Promise.all([
      append(server, view.id, ana, { type: 'task-completed', taskId: 'task:a' }),
      append(server, view.id, ben, { type: 'task-completed', taskId: 'task:b' }),
    ]);

    const anaCatchesUp = await replay(server, view.id, ana, anaSees.lastSeq);
    expect(anaCatchesUp.events.map((e) => e.seq)).toEqual([4, 5]);
    expect(new Set(anaCatchesUp.events.map((e) => e.taskId))).toEqual(new Set(['task:a', 'task:b']));
    expect(anaCatchesUp.lastSeq).toBe(5);
    expect(anaCatchesUp.members).toHaveLength(2);

    // Ben, who never polled, replays the whole thing and lands on the same log.
    const benSees = await replay(server, view.id, ben);
    expect(benSees.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(benSees.events.slice(3).map((e) => e.taskId)).toEqual(anaCatchesUp.events.map((e) => e.taskId));
  });

  dbIt('says nothing new when there is nothing new, and still reports the clock', async () => {
    const server = await start();
    const { host: h } = await actors();
    const view = await host(server, h);
    clock = T0 + 5_000;
    const log = await replay(server, view.id, h, 0);
    expect(log.events).toEqual([]);
    expect(log.lastSeq).toBe(0);
    expect(log.serverTimeMs).toBe(T0 + 5_000);
  });

  dbIt('is closed to a device that has not joined', async () => {
    const server = await start();
    const { host: h, stranger } = await actors();
    const view = await host(server, h);
    const res = await server.inject({ method: 'GET', url: `/v1/sessions/${view.id}/events`, headers: auth(stranger) });
    expect(res.statusCode).toBe(403);
    const push = await append(server, view.id, stranger, { type: 'task-completed', taskId: 'task:a' });
    expect(push.statusCode).toBe(403);
  });

  dbIt('rejects an event type it does not know', async () => {
    const server = await start();
    const { host: h } = await actors();
    const view = await host(server, h);
    const res = await append(server, view.id, h, { type: 'task-exploded' });
    expect(res.statusCode).toBe(400);
  });

  dbIt('refuses to append to an expired session', async () => {
    const server = await start();
    const { host: h } = await actors();
    const view = await host(server, h);
    await db().update(sessions).set({ expiresAt: new Date(T0 - 1) });
    const res = await append(server, view.id, h, { type: 'session-started' });
    expect(res.statusCode).toBe(410);
  });
});
