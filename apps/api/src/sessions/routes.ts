import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import {
  AppendSessionEventRequestSchema,
  CreateSessionRequestSchema,
  JoinSessionRequestSchema,
  SessionEventsQuerySchema,
  sessionRoutes,
  type SessionEvent,
  type SessionEventType,
  type SessionEventsResponse,
  type SessionInputs,
  type SessionMember,
  type SessionStatus,
  type SessionView,
} from '@kitchen/contracts';
import type { Cook } from '@kitchen/domain';
import type { Database } from '../db/client';
import {
  appendEvent,
  claimCook,
  createSession,
  eventsSince,
  generateJoinCode,
  highestSeq,
  isUniqueViolation,
  markSessionStarted,
  membersOf,
  sessionByJoinCode,
  sessionById,
  type AppendedEvent,
} from '../db/sessions';
import { requireHost } from '../auth/devices';
import { ApiError } from '../errors';

/**
 * Shared sessions.
 *
 * What the server holds is small on purpose: the inputs, the crew, who has claimed which
 * cook, and the ordered log. It never holds a timeline. Every device compiles its own from
 * the inputs, and the log is what keeps them telling the same story — a task finished on
 * one phone is a fact in the log, not a message to the others.
 *
 * Two rules are enforced here rather than in the interface, because an interface is not
 * where rules live: only the host may start the session, and a cook can be claimed by one
 * device at a time.
 */

export type SessionRouteContext = {
  db: Database;
  now: () => number;
  requireDevice: (request: FastifyRequest) => Promise<string>;
  /** Injected so a test can force a join-code collision. */
  random?: () => number;
};

/** Long enough for a late dinner and the washing up; short enough that codes recycle. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Thirty-one to the sixth is 887 million codes; six collisions in a row is a bug, not luck. */
const JOIN_CODE_ATTEMPTS = 6;

type SessionRow = NonNullable<Awaited<ReturnType<typeof sessionById>>>;

const parseOrReject = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'That request is not valid.', {
      details: parsed.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }
  return parsed.data;
};

const newEventId = (): string => `ev_${randomBytes(8).toString('hex')}`;

const toMember = (
  row: { deviceId: string; cookId: string; displayName: string },
  hostDeviceId: string,
): SessionMember => ({
  deviceId: row.deviceId,
  cookId: row.cookId,
  displayName: row.displayName,
  isHost: row.deviceId === hostDeviceId,
});

const toEvent = (e: AppendedEvent): SessionEvent => ({
  id: e.id,
  seq: e.seq,
  type: e.type as SessionEventType,
  taskId: e.taskId,
  payload: (e.payload ?? {}) as Record<string, unknown>,
  byDeviceId: e.byDeviceId,
  atMs: e.serverTs.getTime(),
});

export const registerSessionRoutes = (app: FastifyInstance, ctx: SessionRouteContext): void => {
  const { db, now, requireDevice } = ctx;
  const random = ctx.random ?? Math.random;

  const load = async (id: string): Promise<SessionRow> => {
    const row = await sessionById(db, id);
    if (!row) throw new ApiError('session_not_found', 'That session does not exist.');
    if (row.expiresAt.getTime() <= now()) {
      throw new ApiError('session_expired', 'That session has expired. Start a new one.');
    }
    return row;
  };

  /** The host is always in; everyone else has to have claimed a cook. */
  const requireAccess = async (session: SessionRow, deviceId: string): Promise<void> => {
    if (session.hostDeviceId === deviceId) return;
    const members = await membersOf(db, session.id);
    if (!members.some((m) => m.deviceId === deviceId)) {
      throw new ApiError('forbidden', 'This device is not part of that session.');
    }
  };

  const view = async (session: SessionRow): Promise<SessionView> => {
    const [members, lastSeq] = await Promise.all([
      membersOf(db, session.id),
      highestSeq(db, session.id),
    ]);
    return {
      id: session.id,
      joinCode: session.joinCode,
      status: session.status as SessionStatus,
      hostDeviceId: session.hostDeviceId,
      // Validated against the contract on the way in; stored verbatim.
      inputs: session.inputs as SessionInputs,
      crew: session.crew as Cook[],
      scheduleHash: session.scheduleHash,
      schedulerVersion: session.schedulerVersion,
      members: members.map((m) => toMember(m, session.hostDeviceId)),
      startedAtMs: session.startedAt?.getTime() ?? null,
      lastSeq,
      serverTimeMs: now(),
      expiresAt: session.expiresAt.toISOString(),
    };
  };

  const idOf = (request: FastifyRequest): string => (request.params as { id: string }).id;

  // ---------------------------------------------------------------- create
  app.post(sessionRoutes.createSession.path, async (request, reply) => {
    const deviceId = await requireDevice(request);
    const body = parseOrReject(CreateSessionRequestSchema, request.body ?? {});
    const id = `sess_${randomBytes(12).toString('hex')}`;

    for (let attempt = 1; ; attempt++) {
      try {
        await createSession(db, {
          id,
          joinCode: generateJoinCode(random),
          hostDeviceId: deviceId,
          inputs: body.inputs,
          crew: body.crew,
          scheduleHash: body.scheduleHash,
          schedulerVersion: body.schedulerVersion,
          expiresAt: new Date(now() + SESSION_TTL_MS),
        });
        break;
      } catch (err) {
        // A code already in use is the one failure worth retrying; anything else is real.
        if (!isUniqueViolation(err) || attempt >= JOIN_CODE_ATTEMPTS) throw err;
      }
    }

    return reply.status(201).send(await view((await sessionById(db, id))!));
  });

  // --------------------------------------------------------------- by code
  app.get(sessionRoutes.sessionByCode.path, async (request) => {
    await requireDevice(request);
    const { code } = request.params as { code: string };
    const session = await sessionByJoinCode(db, code.trim().toUpperCase());
    if (!session) {
      throw new ApiError('join_code_invalid', "No session has that code. Check the host's screen.");
    }
    if (session.expiresAt.getTime() <= now()) {
      throw new ApiError('session_expired', 'That session has expired. Ask the host for a new one.');
    }
    return view(session);
  });

  // ------------------------------------------------------------------ read
  app.get(sessionRoutes.getSession.path, async (request) => {
    const deviceId = await requireDevice(request);
    const session = await load(idOf(request));
    await requireAccess(session, deviceId);
    return view(session);
  });

  // ------------------------------------------------------------------ join
  app.post(sessionRoutes.joinSession.path, async (request) => {
    const deviceId = await requireDevice(request);
    const session = await load(idOf(request));
    const body = parseOrReject(JoinSessionRequestSchema, request.body ?? {});

    const crew = session.crew as Cook[];
    const cook = crew.find((c) => c.id === body.cookId);
    if (!cook) {
      throw new ApiError('invalid_request', 'That cook is not in this crew.', {
        details: [{ path: 'cookId', message: 'not one of the compiled cooks' }],
      });
    }

    const claimed = await claimCook(db, {
      sessionId: session.id,
      deviceId,
      cookId: cook.id,
      displayName: body.displayName,
      skill: cook.skill,
    });
    if (!claimed.ok) {
      throw new ApiError('conflict', `${claimed.holder} already took that one. Pick another.`);
    }

    await appendEvent(db, {
      id: newEventId(),
      sessionId: session.id,
      type: 'member-joined',
      payload: { cookId: cook.id, displayName: body.displayName },
      byDeviceId: deviceId,
    });

    return view((await sessionById(db, session.id))!);
  });

  // ---------------------------------------------------------------- replay
  app.get(sessionRoutes.sessionEvents.path, async (request) => {
    const deviceId = await requireDevice(request);
    const session = await load(idOf(request));
    await requireAccess(session, deviceId);
    const query = parseOrReject(SessionEventsQuerySchema, request.query ?? {});

    const [events, members] = await Promise.all([
      eventsSince(db, session.id, query.after),
      membersOf(db, session.id),
    ]);
    const last = events[events.length - 1];
    const body: SessionEventsResponse = {
      events: events.map(toEvent),
      lastSeq: last ? last.seq : await highestSeq(db, session.id),
      status: session.status as SessionStatus,
      startedAtMs: session.startedAt?.getTime() ?? null,
      members: members.map((m) => toMember(m, session.hostDeviceId)),
      serverTimeMs: now(),
    };
    return body;
  });

  // ---------------------------------------------------------------- append
  app.post(sessionRoutes.appendSessionEvent.path, async (request, reply) => {
    const deviceId = await requireDevice(request);
    const session = await load(idOf(request));
    const body = parseOrReject(AppendSessionEventRequestSchema, request.body ?? {});

    if (body.type === 'session-started') {
      await requireHost(db, session.id, deviceId);
      if (session.status !== 'open') {
        throw new ApiError('conflict', 'This session has already started.');
      }
      const at = now();
      await markSessionStarted(db, session.id, new Date(at));
      const event = await appendEvent(db, {
        id: newEventId(),
        sessionId: session.id,
        type: 'session-started',
        payload: { startedAtMs: at },
        byDeviceId: deviceId,
      });
      return reply.status(201).send({ event: toEvent(event), serverTimeMs: now() });
    }

    await requireAccess(session, deviceId);
    if (session.status !== 'cooking') {
      throw new ApiError('conflict', 'Nothing can be finished before the session has started.');
    }
    const event = await appendEvent(db, {
      id: newEventId(),
      sessionId: session.id,
      type: 'task-completed',
      taskId: body.taskId,
      byDeviceId: deviceId,
    });
    return reply.status(201).send({ event: toEvent(event), serverTimeMs: now() });
  });
};
