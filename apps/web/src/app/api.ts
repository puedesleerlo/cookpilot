import type { z } from 'zod';
import {
  AppendSessionEventResponseSchema,
  CreateDeviceResponseSchema,
  ErrorBodySchema,
  SessionEventsResponseSchema,
  SessionViewSchema,
  TimeResponseSchema,
  routes,
  sessionRoutes,
  type AppendSessionEventRequest,
  type CreateSessionRequest,
  type ErrorCode,
  type JoinSessionRequest,
} from '@kitchen/contracts';

/**
 * The API, from the client's side.
 *
 * Everything here is typed from `@kitchen/contracts`, which is the only place a wire shape
 * is written down. The client does not know what a session looks like; it knows what the
 * contract says one looks like, and so does the server.
 *
 * Identity is a device token, issued once and kept in local storage. There is no account
 * to log into and nothing personal in the token, so keeping it on the device is keeping a
 * bookmark, not a credential someone would want.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Where the API is.
 *
 * `VITE_API_URL` names it; empty means the page's own origin. One adjustment: when the
 * configured host is localhost but the page is being viewed from somewhere else, the API is
 * assumed to be on the same machine the page came from. That is exactly the situation of a
 * phone that has scanned a laptop's QR code on the kitchen wifi — the laptop's `localhost`
 * is not the phone's, but the laptop's address is the one the page just loaded from.
 */
export const apiBaseUrl = (): string => {
  const configured = (import.meta.env['VITE_API_URL'] as string | undefined)?.trim() ?? '';
  if (!configured) return '';
  if (typeof window === 'undefined') return configured.replace(/\/$/, '');
  try {
    const url = new URL(configured);
    const here = window.location.hostname;
    if (LOCAL_HOSTS.has(url.hostname) && here && !LOCAL_HOSTS.has(here)) url.hostname = here;
    return url.origin;
  } catch {
    return configured.replace(/\/$/, '');
  }
};

/** True when the page itself was opened on localhost, which a phone cannot follow. */
export const servedFromLocalhost = (): boolean =>
  typeof window !== 'undefined' && LOCAL_HOSTS.has(window.location.hostname);

export type ClientErrorCode = ErrorCode | 'network' | 'unexpected';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const isApiError = (err: unknown, code?: ClientErrorCode): err is ApiRequestError =>
  err instanceof ApiRequestError && (code === undefined || err.code === code);

// ------------------------------------------------------------------ device

const DEVICE_KEY = 'kc.device';

export type StoredDevice = { deviceId: string; token: string; expiresAt: string };

const readDevice = (): StoredDevice | null => {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDevice>;
    return parsed.deviceId && parsed.token && parsed.expiresAt
      ? { deviceId: parsed.deviceId, token: parsed.token, expiresAt: parsed.expiresAt }
      : null;
  } catch {
    return null;
  }
};

const writeDevice = (device: StoredDevice | null): void => {
  try {
    if (device) localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Private mode, or storage disabled. The device works for this page load and that is all.
  }
};

/** A token with less than a minute left is not worth presenting. */
const usable = (device: StoredDevice | null): device is StoredDevice =>
  device !== null && Date.parse(device.expiresAt) > Date.now() + 60_000;

let issuing: Promise<StoredDevice> | null = null;

/** The device this browser is, issued on first use and kept. Concurrent callers share one issue. */
export const ensureDevice = async (): Promise<StoredDevice> => {
  const have = readDevice();
  if (usable(have)) return have;
  issuing ??= call({ method: 'POST', path: routes.createDevice.path, body: {}, response: CreateDeviceResponseSchema })
    .then((issued) => {
      writeDevice(issued);
      return issued;
    })
    .finally(() => {
      issuing = null;
    });
  return issuing;
};

export const forgetDevice = (): void => writeDevice(null);

// -------------------------------------------------------------------- call

type CallOptions<T> = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  auth?: boolean;
  response: z.ZodType<T>;
};

const NETWORK_MESSAGE =
  'Could not reach the kitchen server. Check the connection, and that the API is running.';

/**
 * One request. A non-2xx answer becomes an `ApiRequestError` carrying the contract's code,
 * so callers branch on `code` and never on prose. A token the server no longer recognises —
 * the database was reset, or the device was revoked — is dropped and re-issued once, because
 * the alternative is a phone that can never join anything again until someone clears its
 * storage.
 */
export const call = async <T>(opts: CallOptions<T>, retried = false): Promise<T> => {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth) headers['authorization'] = `Bearer ${(await ensureDevice()).token}`;

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${opts.path}`, {
      method: opts.method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  } catch {
    throw new ApiRequestError('network', NETWORK_MESSAGE, 0);
  }

  if (res.status === 401 && opts.auth && !retried) {
    forgetDevice();
    return call(opts, true);
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(json);
    if (parsed.success) {
      const { code, message, requestId } = parsed.data.error;
      throw new ApiRequestError(code, message, res.status, requestId);
    }
    throw new ApiRequestError('unexpected', `The server answered ${res.status}.`, res.status);
  }

  const parsed = opts.response.safeParse(json);
  if (!parsed.success) {
    throw new ApiRequestError('unexpected', 'The server answered in a shape this app does not know.', res.status);
  }
  return parsed.data;
};

const withParams = (path: string, params: Record<string, string>): string =>
  Object.entries(params).reduce(
    (p, [key, value]) => p.replace(`:${key}`, encodeURIComponent(value)),
    path,
  );

// --------------------------------------------------------------- the routes

export const api = {
  time: () => call({ method: 'GET', path: routes.time.path, response: TimeResponseSchema }),

  createSession: (body: CreateSessionRequest) =>
    call({ method: 'POST', path: sessionRoutes.createSession.path, body, auth: true, response: SessionViewSchema }),

  sessionByCode: (code: string) =>
    call({
      method: 'GET',
      path: withParams(sessionRoutes.sessionByCode.path, { code }),
      auth: true,
      response: SessionViewSchema,
    }),

  getSession: (id: string) =>
    call({ method: 'GET', path: withParams(sessionRoutes.getSession.path, { id }), auth: true, response: SessionViewSchema }),

  joinSession: (id: string, body: JoinSessionRequest) =>
    call({
      method: 'POST',
      path: withParams(sessionRoutes.joinSession.path, { id }),
      body,
      auth: true,
      response: SessionViewSchema,
    }),

  events: (id: string, after: number) =>
    call({
      method: 'GET',
      path: `${withParams(sessionRoutes.sessionEvents.path, { id })}?after=${after}`,
      auth: true,
      response: SessionEventsResponseSchema,
    }),

  append: (id: string, body: AppendSessionEventRequest) =>
    call({
      method: 'POST',
      path: withParams(sessionRoutes.appendSessionEvent.path, { id }),
      body,
      auth: true,
      response: AppendSessionEventResponseSchema,
    }),
};

// -------------------------------------------------------------------- clock

/**
 * The offset between the server's clock and this device's, in milliseconds to add to
 * `Date.now()`. Half the round trip is assumed to be the request's share. Two phones
 * running countdowns off their own clocks disagree inside one session; anchored to the
 * same server they agree to within a round trip, which nobody can see.
 */
export const offsetFrom = (serverTimeMs: number, sentAtMs: number, receivedAtMs: number): number =>
  serverTimeMs - (sentAtMs + (receivedAtMs - sentAtMs) / 2);

export const measureClockOffset = async (): Promise<number> => {
  const sent = Date.now();
  const { serverTimeMs } = await api.time();
  return offsetFrom(serverTimeMs, sent, Date.now());
};
