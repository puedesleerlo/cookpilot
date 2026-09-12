import { ErrorCodeSchema, type ErrorBody, type ErrorCode } from '@kitchen/contracts';

/**
 * One error model.
 *
 * Clients branch on `code`. `message` is for people and may change freely. Anything we did
 * not anticipate becomes a generic 500 with a request id — a stack trace or a driver error
 * reaching a browser tells an attacker about the schema and tells the user nothing.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: { path: string; message: string }[];
  readonly expose = true;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { status?: number; details?: { path: string; message: string }[] } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? DEFAULT_STATUS[code];
    if (opts.details) this.details = opts.details;
  }
}

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  session_not_found: 404,
  session_expired: 410,
  join_code_invalid: 404,
  conflict: 409,
  sequence_conflict: 409,
  rate_limited: 429,
  dependency_unavailable: 503,
  provider_unavailable: 503,
  internal: 500,
};

export const badRequest = (message: string, details?: { path: string; message: string }[]) =>
  new ApiError('invalid_request', message, details ? { details } : {});

export const notFound = (code: ErrorCode, message: string) => new ApiError(code, message);

/**
 * Turn anything thrown into a client-safe envelope. The only branch that matters is
 * whether we recognise it: if not, the client gets a generic message and the detail stays
 * in the log.
 */
export const toErrorBody = (
  err: unknown,
  requestId: string,
): { status: number; body: ErrorBody; internal?: unknown } => {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.details ? { details: err.details } : {}),
        },
      },
    };
  }

  /**
   * Some plugins throw a body rather than an Error. `@fastify/rate-limit`'s
   * `errorResponseBuilder` result arrives here as a bare object carrying our own envelope,
   * with no `statusCode` and no `message` — so without this branch a throttled request
   * became a generic 500 and the client could not tell it apart from a crash.
   */
  const enveloped = err as { error?: { code?: unknown; message?: unknown } };
  if (enveloped?.error && isErrorCode(enveloped.error.code)) {
    const code = enveloped.error.code;
    return {
      status: DEFAULT_STATUS[code],
      body: {
        error: {
          code,
          message:
            typeof enveloped.error.message === 'string'
              ? enveloped.error.message
              : 'That request could not be completed.',
          requestId,
        },
      },
    };
  }

  // Fastify's own validation errors arrive with a `validation` array.
  const maybe = err as { validation?: { instancePath?: string; message?: string }[]; statusCode?: number };
  if (Array.isArray(maybe.validation)) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'The request body did not match what this endpoint accepts.',
          requestId,
          details: maybe.validation.map((v) => ({
            path: (v.instancePath ?? '').replace(/^\//, '') || '(root)',
            message: v.message ?? 'invalid',
          })),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'internal',
        message: 'Something went wrong on our side. The request id below identifies it in our logs.',
        requestId,
      },
    },
    internal: err,
  };
};

export const isErrorCode = (value: unknown): value is ErrorCode =>
  ErrorCodeSchema.safeParse(value).success;
