import { z } from 'zod';

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
  Object.entries(routes).map(([name, contract]) => ({ name, ...(contract as RouteContract) }));
