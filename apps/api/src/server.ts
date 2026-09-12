import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import {
  REQUEST_ID_HEADER,
  allRoutes,
  routes,
  type DependencyStatus,
  type ReadyResponse,
} from '@kitchen/contracts';
import { SCHEDULER_VERSION } from '@kitchen/scheduler';
import { toErrorBody } from './errors';
import { createLogger } from './logging';
import { describeEnv, type Env } from './config/env';
import { buildOpenApi } from './openapi';

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
};

export const buildServer = async ({
  env,
  dependencies = [],
  now = () => Date.now(),
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

  // -------------------------------------------------------------- openapi
  const spec = buildOpenApi(allRoutes());
  app.get('/openapi.json', async () => spec);

  app.log.info(describeEnv(env), 'api configured');
  return app;
};
