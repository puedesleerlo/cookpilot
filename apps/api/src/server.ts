import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import {
  CreateDeviceRequestSchema,
  REQUEST_ID_HEADER,
  allRoutes,
  routes,
  type DependencyStatus,
  type ReadyResponse,
} from '@kitchen/contracts';
import { SCHEDULER_VERSION } from '@kitchen/scheduler';
import { ApiError, toErrorBody } from './errors';
import { createLogger } from './logging';
import { describeEnv, type Env } from './config/env';
import { buildOpenApi } from './openapi';
import type { Database } from './db/client';
import { bearerFrom, issueDevice, touchDevice, verifyDevice } from './auth/devices';
import { stageMetrics, totalSpendUsd } from './llm/gateway';

/**
 * A dependency the instance needs before it can take traffic. Registered rather than
 * hardcoded so `add-persistence-layer` can add Postgres without editing this file.
 */
export type DependencyCheck = {
  name: string;
  check: () => Promise<{ ok: boolean; detail?: string }>;
};

export type BuildOptions = {
  env: Env;
  dependencies?: DependencyCheck[];
  /** Injected so tests can drive time without a real clock. */
  now?: () => number;
  /** Absent in the unit tests that only exercise the routes needing no storage. */
  db?: Database;
  /** Signing key for device tokens. Required once `db` is present. */
  jwtSecret?: string;
  /** Lowered in tests so the limiter can be exercised without a thousand requests. */
  rateLimits?: { globalPerMinute: number; deviceCreationPerHour: number };
};

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireDevice`. Absent on unauthenticated routes. */
    deviceId?: string;
  }
}

export const buildServer = async ({
  env,
  dependencies = [],
  now = () => Date.now(),
  db,
  jwtSecret,
  rateLimits = { globalPerMinute: 300, deviceCreationPerHour: 20 },
}: BuildOptions): Promise<FastifyInstance> => {
  const startedAt = now();

  const app = Fastify({
    loggerInstance: createLogger(env),
    // Honour a caller-supplied id so a trace can span the client and the server.
    genReqId: (req) => {
      const supplied = req.headers[REQUEST_ID_HEADER];
      return typeof supplied === 'string' && supplied.length > 0 && supplied.length <= 200
        ? supplied
        : randomUUID();
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  /**
   * Keyed on the device where there is one, and on the address otherwise. Keying purely on
   * address would mean two cooks on the same wifi share a budget, which is exactly the
   * situation this product is built for.
   */
  await app.register(rateLimit, {
    global: true,
    max: rateLimits.globalPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => request.deviceId ?? request.ip,
    errorResponseBuilder: (request, context) => ({
      error: {
        code: 'rate_limited',
        message: `Too many requests. Try again in ${Math.ceil(Number(context.ttl) / 1000)}s.`,
        requestId: String(request.id),
      },
    }),
  });

  // Every response carries its id, so a screenshot of an error is enough to find the logs.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    return payload;
  });

  app.setErrorHandler((err, request, reply) => {
    const { status, body, internal } = toErrorBody(err, String(request.id));
    if (internal !== undefined) {
      // The detail stays here. The client gets a code and an id.
      request.log.error({ err: internal }, 'unhandled error');
    } else {
      request.log.warn({ code: body.error.code, status }, 'request failed');
    }
    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'not_found',
        message: `No route for ${request.method} ${request.url}.`,
        requestId: String(request.id),
      },
    });
  });

  // ------------------------------------------------------------- liveness
  // Depends on nothing. A dead database must not convince Cloud Run to restart a process
  // that is working perfectly well and waiting for the database to come back.
  app.get(routes.health.path, async () => ({
    status: 'ok' as const,
    service: 'api',
    uptimeSec: Math.max(0, Math.floor((now() - startedAt) / 1000)),
  }));

  // ------------------------------------------------------------ readiness
  app.get(routes.ready.path, async (_request, reply) => {
    const checked: DependencyStatus[] = await Promise.all(
      dependencies.map(async (d) => {
        const began = now();
        try {
          const result = await d.check();
          return {
            name: d.name,
            ok: result.ok,
            latencyMs: Math.max(0, now() - began),
            ...(result.detail ? { detail: result.detail } : {}),
          };
        } catch (err) {
          return {
            name: d.name,
            ok: false,
            latencyMs: Math.max(0, now() - began),
            detail: err instanceof Error ? err.message : 'check threw',
          };
        }
      }),
    );

    const ready = checked.every((d) => d.ok);
    const body: ReadyResponse = {
      status: ready ? 'ready' : 'not-ready',
      schedulerVersion: SCHEDULER_VERSION,
      dependencies: checked,
    };
    return reply.status(ready ? 200 : 503).send(body);
  });

  // ----------------------------------------------------------------- time
  app.get(routes.time.path, async () => {
    const ms = now();
    return { serverTimeMs: ms, iso: new Date(ms).toISOString() };
  });

  // -------------------------------------------------------------- identity
  if (db && jwtSecret) {
    /**
     * A route declares that it needs a device; it does not remember to check. A handler
     * that forgets an `if` is a hole, and the holes are never in the handler anyone reviews.
     */
    const requireDevice = async (request: FastifyRequest): Promise<string> => {
      const { deviceId } = await verifyDevice(db, jwtSecret, bearerFrom(request.headers.authorization));
      request.deviceId = deviceId;
      return deviceId;
    };
    app.decorate('requireDevice', requireDevice);

    app.post(
      routes.createDevice.path,
      {
        config: {
          rateLimit: { max: rateLimits.deviceCreationPerHour, timeWindow: '1 hour' },
        },
      },
      async (request, reply) => {
        const parsed = CreateDeviceRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          throw new ApiError('invalid_request', 'That request body is not valid.', {
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.') || '(root)',
              message: i.message,
            })),
          });
        }
        const issued = await issueDevice(db, jwtSecret, now);
        return reply.status(201).send({
          deviceId: issued.deviceId,
          token: issued.token,
          expiresAt: issued.expiresAt.toISOString(),
        });
      },
    );

    app.get(routes.whoAmI.path, async (request) => {
      const deviceId = await requireDevice(request);
      await touchDevice(db, deviceId, new Date(now()));
      return { deviceId };
    });
  }

  /**
   * Per-provider spend, so a cost surprise is something you notice rather than something
   * you find on an invoice. Internal, and deliberately not under /v1 — it is not part of
   * the client contract.
   */
  app.get('/internal/metrics', async () => ({
    llm: {
      totalSpendUsd: Number(totalSpendUsd().toFixed(6)),
      stages: stageMetrics().map((m) => ({ ...m, costUsd: Number(m.costUsd.toFixed(6)) })),
    },
  }));

  // -------------------------------------------------------------- openapi
  const spec = buildOpenApi(allRoutes());
  app.get('/openapi.json', async () => spec);

  if (!db || !jwtSecret) {
    // Loud, because the first real boot of this service had exactly this gap: the identity
    // routes existed, were tested through the harness, and were absent in production.
    app.log.warn(
      { db: Boolean(db), jwtSecret: Boolean(jwtSecret) },
      'identity routes are NOT registered: buildServer was called without db and jwtSecret',
    );
  }

  app.log.info(
    { ...describeEnv(env), identityRoutes: Boolean(db && jwtSecret) },
    'api configured',
  );
  return app;
};
