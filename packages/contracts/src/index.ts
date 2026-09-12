import { z } from 'zod';
import { AllergenSchema, CookSchema, IngredientSchema } from '@kitchen/domain';
import {
  CookRequestSchema as CookRequestBodySchema,
  CookResponseSchema as CookPipelineResponseSchema,
  TranscribeResponseSchema as CookTranscribeResponseSchema,
} from './cook';

/**
 * The wire contract.
 *
 * Defined once, here, and consumed by both sides: the server derives its runtime
 * validation from these schemas and the client derives its types from them. The point is
 * that neither can drift by editing its own copy — there is no own copy. Renaming a field
 * here breaks the typecheck on both sides in the same commit, which is the cheapest moment
 * to find out.
 */

export const API_VERSION = 'v1';

// ------------------------------------------------------------------- errors

/**
 * Stable, machine-readable failure codes. Clients branch on `code`, never on `message` —
 * prose is for people and is free to change.
 */
export const ErrorCodeSchema = z.enum([
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'session_not_found',
  'session_expired',
  'join_code_invalid',
  'conflict',
  'sequence_conflict',
  'rate_limited',
  'dependency_unavailable',
  'provider_unavailable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    /** For people. Never an internal message, a stack, or a driver error. */
    message: z.string(),
    /** Joins this response to the server log lines that produced it. */
    requestId: z.string(),
    /** Field-level detail for validation failures. Absent otherwise. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const REQUEST_ID_HEADER = 'x-request-id';

// ------------------------------------------------------------------- health

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  uptimeSec: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DependencyStatusSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  /** Present only when `ok` is false. Safe to show an operator, never a secret. */
  detail: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
});
export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

export const ReadyResponseSchema = z.object({
  status: z.enum(['ready', 'not-ready']),
  /**
   * Which build of the engine this instance runs. A client computing optimistically
   * compares this with its own; a mismatch means a stale cached bundle, and that is worth
   * knowing before two devices disagree about a timeline.
   */
  schedulerVersion: z.string(),
  dependencies: z.array(DependencyStatusSchema),
});
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;

// --------------------------------------------------------------------- time

/**
 * The authoritative clock.
 *
 * Two phones running countdowns off their own clocks will disagree inside one session, and
 * a timer nobody trusts is worse than no timer. Clients anchor to the offset between
 * `serverTimeMs` and their own clock, and re-anchor periodically.
 */
export const TimeResponseSchema = z.object({
  serverTimeMs: z.number().int().nonnegative(),
  iso: z.string(),
});
export type TimeResponse = z.infer<typeof TimeResponseSchema>;

// ------------------------------------------------------------------ devices

/**
 * Identity is a device, not a person: no email, no password, nothing personal. The token's
 * claims are a device id and two timestamps, and the server stores only its hash.
 */
export const CreateDeviceRequestSchema = z.object({
  /** Optional, cosmetic, shown to the other cook. Never required, never validated as a name. */
  displayName: z.string().max(40).optional(),
});
export type CreateDeviceRequest = z.infer<typeof CreateDeviceRequestSchema>;

export const CreateDeviceResponseSchema = z.object({
  deviceId: z.string(),
  /** Present exactly once, in this response. The server keeps only a hash. */
  token: z.string(),
  expiresAt: z.string(),
});
export type CreateDeviceResponse = z.infer<typeof CreateDeviceResponseSchema>;

export const WhoAmIResponseSchema = z.object({
  deviceId: z.string(),
});
export type WhoAmIResponse = z.infer<typeof WhoAmIResponseSchema>;

// ----------------------------------------------------------- route registry

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type RouteContract<
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TResponse extends z.ZodTypeAny = z.ZodTypeAny,
  TQuery extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  method: HttpMethod;
  path: string;
  summary: string;
  body?: TBody;
  query?: TQuery;
  response: TResponse;
  /** Non-2xx codes this route can return, so the generated document is honest. */
  errors: ErrorCode[];
  /** False for routes reachable before a client holds a device token. */
  auth: boolean;
};

export const describeRoute = <
  TBody extends z.ZodTypeAny,
  TResponse extends z.ZodTypeAny,
  TQuery extends z.ZodTypeAny,
>(
  contract: RouteContract<TBody, TResponse, TQuery>,
): RouteContract<TBody, TResponse, TQuery> => contract;

// ------------------------------------------------------------------- routes

export const routes = {
  health: describeRoute({
    method: 'GET',
    path: '/healthz',
    summary: 'Liveness. Depends on nothing, so a dead database does not restart the process.',
    response: HealthResponseSchema,
    errors: [],
    auth: false,
  }),

  ready: describeRoute({
    method: 'GET',
    path: '/readyz',
    summary: 'Readiness. Checks dependencies and reports whether this instance can take traffic.',
    response: ReadyResponseSchema,
    errors: ['dependency_unavailable'],
    auth: false,
  }),

  time: describeRoute({
    method: 'GET',
    path: '/v1/time',
    summary: 'Server clock, for anchoring client timers. Unauthenticated by necessity.',
    response: TimeResponseSchema,
    errors: [],
    auth: false,
  }),

  createDevice: describeRoute({
    method: 'POST',
    path: '/v1/devices',
    summary: 'Issue an anonymous device token. No account, no personal data.',
    body: CreateDeviceRequestSchema,
    response: CreateDeviceResponseSchema,
    errors: ['rate_limited'],
    auth: false,
  }),

  whoAmI: describeRoute({
    method: 'GET',
    path: '/v1/devices/me',
    summary: 'Confirm a device token is still valid. Fails closed if the device was revoked.',
    response: WhoAmIResponseSchema,
    errors: ['unauthorized'],
    auth: true,
  }),
} as const;

export type RouteName = keyof typeof routes;

export const allRoutes = (): (RouteContract & { name: string })[] =>
  Object.entries({ ...routes, ...sessionRoutes, ...cookRoutes }).map(([name, contract]) => ({
    name,
    ...(contract as RouteContract),
  }));

// ----------------------------------------------------------------- sessions

/**
 * A session, on the wire.
 *
 * What travels is the intake — exactly as the structured form fills it in — and the crew
 * it compiled to. What never travels is the schedule: any device with these inputs and the
 * same ordered log compiles the same timeline, so sending one would only create something
 * for two phones to disagree about. The host does send a hash of the schedule it compiled,
 * and every device that joins checks its own compile against it. Agreement is verified,
 * not assumed.
 */
const answer = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: z.enum(['stated', 'assumed']) });

export const SessionInputsSchema = z.object({
  pantry: z.array(IngredientSchema).min(1),
  timeBudgetMin: answer(z.number().int().positive()),
  servings: answer(z.number().int().positive()),
  mealCount: answer(z.number().int().positive()),
  cookCount: answer(z.number().int().positive()),
  equipment: answer(
    z.array(z.object({ kind: z.string().min(1), count: z.number().int().nonnegative() })),
  ),
  restrictions: answer(z.array(AllergenSchema)),
  style: answer(z.string()),
  wantsBeverages: answer(z.boolean()),
});
export type SessionInputs = z.infer<typeof SessionInputsSchema>;

/**
 * Six characters, no `0`/`O`, no `1`/`I`/`L`. People read these aloud across a kitchen, and
 * a code that has to be spelled twice is a code that gets typed wrong once. Defined here so
 * the server generates from the same alphabet the client validates against.
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET_RE = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

export const SessionStatusSchema = z.enum(['open', 'cooking', 'done']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionMemberSchema = z.object({
  deviceId: z.string(),
  /** Which cook in the compiled crew this device is. */
  cookId: z.string(),
  /** What they asked to be called. Cosmetic; the schedule knows them by `cookId`. */
  displayName: z.string(),
  isHost: z.boolean(),
});
export type SessionMember = z.infer<typeof SessionMemberSchema>;

/**
 * The event vocabulary. Small on purpose: every type here is something the fold on every
 * device has to agree about, and every type added is a way for two phones to diverge.
 */
export const SessionEventTypeSchema = z.enum([
  'member-joined',
  'session-started',
  /** A cook began a task by hand — early, or to restart its timer. Payload: `startedAtMs`. */
  'task-started',
  'task-completed',
]);
export type SessionEventType = z.infer<typeof SessionEventTypeSchema>;

export const SessionEventSchema = z.object({
  id: z.string(),
  /** Assigned by the server, unique per session, dense from 1. Never chosen by a client. */
  seq: z.number().int().positive(),
  type: SessionEventTypeSchema,
  taskId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  byDeviceId: z.string().nullable(),
  /** Server clock at append, milliseconds since the epoch. */
  atMs: z.number().int().nonnegative(),
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const SessionViewSchema = z.object({
  id: z.string(),
  joinCode: z.string(),
  status: SessionStatusSchema,
  hostDeviceId: z.string(),
  inputs: SessionInputsSchema,
  crew: z.array(CookSchema).min(1),
  scheduleHash: z.string(),
  schedulerVersion: z.string(),
  members: z.array(SessionMemberSchema),
  /** Server clock when the host started cooking. Null while the lobby is open. */
  startedAtMs: z.number().int().nonnegative().nullable(),
  lastSeq: z.number().int().nonnegative(),
  /** So a client re-anchors its clock on every response, not only on `/v1/time`. */
  serverTimeMs: z.number().int().nonnegative(),
  expiresAt: z.string(),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

export const CreateSessionRequestSchema = z.object({
  inputs: SessionInputsSchema,
  crew: z.array(CookSchema).min(1),
  /** Content hash of the schedule the host compiled from `inputs`. */
  scheduleHash: z.string().min(1),
  schedulerVersion: z.string().min(1),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const JoinSessionRequestSchema = z.object({
  cookId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40),
});
export type JoinSessionRequest = z.infer<typeof JoinSessionRequestSchema>;

export const SessionEventsQuerySchema = z.object({
  /** Replay everything after this sequence number. Zero replays the whole log. */
  after: z.coerce.number().int().nonnegative().default(0),
});
export type SessionEventsQuery = z.infer<typeof SessionEventsQuerySchema>;

/** One poll carries everything that can change, so a phone needs one request per tick. */
export const SessionEventsResponseSchema = z.object({
  events: z.array(SessionEventSchema),
  lastSeq: z.number().int().nonnegative(),
  status: SessionStatusSchema,
  startedAtMs: z.number().int().nonnegative().nullable(),
  members: z.array(SessionMemberSchema),
  serverTimeMs: z.number().int().nonnegative(),
});
export type SessionEventsResponse = z.infer<typeof SessionEventsResponseSchema>;

export const AppendSessionEventRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session-started') }),
  z.object({ type: z.literal('task-started'), taskId: z.string().min(1) }),
  z.object({ type: z.literal('task-completed'), taskId: z.string().min(1) }),
]);
export type AppendSessionEventRequest = z.infer<typeof AppendSessionEventRequestSchema>;

export const AppendSessionEventResponseSchema = z.object({
  event: SessionEventSchema,
  serverTimeMs: z.number().int().nonnegative(),
});
export type AppendSessionEventResponse = z.infer<typeof AppendSessionEventResponseSchema>;

export const sessionRoutes = {
  createSession: describeRoute({
    method: 'POST',
    path: '/v1/sessions',
    summary: 'Open a shared session from a compiled intake. The caller becomes its host.',
    body: CreateSessionRequestSchema,
    response: SessionViewSchema,
    errors: ['unauthorized', 'invalid_request', 'rate_limited'],
    auth: true,
  }),

  sessionByCode: describeRoute({
    method: 'GET',
    path: '/v1/sessions/by-code/:code',
    summary: 'Look a session up by its six-character join code, before joining it.',
    response: SessionViewSchema,
    errors: ['unauthorized', 'join_code_invalid', 'session_expired'],
    auth: true,
  }),

  getSession: describeRoute({
    method: 'GET',
    path: '/v1/sessions/:id',
    summary: 'The current view of a session. Members and the host only.',
    response: SessionViewSchema,
    errors: ['unauthorized', 'forbidden', 'session_not_found', 'session_expired'],
    auth: true,
  }),

  joinSession: describeRoute({
    method: 'POST',
    path: '/v1/sessions/:id/join',
    summary: 'Claim a cook in the crew and say what to call you.',
    body: JoinSessionRequestSchema,
    response: SessionViewSchema,
    errors: ['unauthorized', 'invalid_request', 'session_not_found', 'session_expired', 'conflict'],
    auth: true,
  }),

  sessionEvents: describeRoute({
    method: 'GET',
    path: '/v1/sessions/:id/events',
    summary: 'Replay the ordered log after a sequence number, with the roster and the clock.',
    query: SessionEventsQuerySchema,
    response: SessionEventsResponseSchema,
    errors: ['unauthorized', 'forbidden', 'session_not_found', 'session_expired'],
    auth: true,
  }),

  appendSessionEvent: describeRoute({
    method: 'POST',
    path: '/v1/sessions/:id/events',
    summary: 'Append to the log: the host starts the session, any member finishes a task.',
    body: AppendSessionEventRequestSchema,
    response: AppendSessionEventResponseSchema,
    errors: ['unauthorized', 'forbidden', 'invalid_request', 'session_not_found', 'session_expired', 'conflict'],
    auth: true,
  }),
} as const;

export type SessionRouteName = keyof typeof sessionRoutes;

// ------------------------------------------------------------ the pipeline

export {
  CookRequestSchema,
  CookResponseSchema,
  PipelineNoteSchema,
  TranscribeResponseSchema,
} from './cook';
export type { CookRequest, CookResponse, PipelineNote, TranscribeResponse } from './cook';

/**
 * The two routes that exist because they hold keys.
 *
 * Transcription takes raw audio rather than a JSON body, so it declares no `body` schema —
 * the contract describes what comes back, and the route validates the bytes itself.
 */
export const cookRoutes = {
  transcribe: describeRoute({
    method: 'POST',
    path: '/v1/voice/transcribe',
    summary: 'Audio in, text out. The ElevenLabs key stays on the server.',
    response: CookTranscribeResponseSchema,
    errors: ['invalid_request', 'rate_limited', 'dependency_unavailable'],
    auth: false,
  }),

  cook: describeRoute({
    method: 'POST',
    path: '/v1/cook',
    summary:
      'Two spoken answers into scaled recipes: intake, queries, search, fetch, extraction.',
    body: CookRequestBodySchema,
    response: CookPipelineResponseSchema,
    errors: ['invalid_request', 'rate_limited', 'dependency_unavailable'],
    auth: false,
  }),
} as const;

export type CookRouteName = keyof typeof cookRoutes;
