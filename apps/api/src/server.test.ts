// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ErrorBodySchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  REQUEST_ID_HEADER,
  TimeResponseSchema,
  allRoutes,
} from '@kitchen/contracts';
import { SCHEDULER_VERSION } from '@kitchen/scheduler';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildServer, type DependencyCheck } from './server';
import { ConfigError, parseEnv } from './config/env';
import { ApiError, toErrorBody } from './errors';
import { createCapturingLogger } from './logging';
import { clearRegisteredSecrets, registerSecretValue } from './config/redact';

const testEnv = (over: Record<string, string> = {}) =>
  parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...over });

let app: FastifyInstance | null = null;
const start = async (opts: Partial<Parameters<typeof buildServer>[0]> = {}) => {
  app = await buildServer({ env: testEnv(), ...opts });
  return app;
};

afterEach(async () => {
  await app?.close();
  app = null;
  clearRegisteredSecrets();
});

describe('configuration is validated at startup', () => {
  it('rejects a non-numeric port and names it', () => {
    try {
      parseEnv({ PORT: 'eighty-eighty' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain('PORT');
    }
  });

  it('applies documented defaults', () => {
    const env = parseEnv({});
    expect(env.PORT).toBe(8080);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DEMO_MODE).toBe(false);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses a comma-separated origin list', () => {
    expect(parseEnv({ CORS_ORIGINS: 'https://a.example, https://b.example' }).CORS_ORIGINS).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});

describe('liveness and readiness are distinguishable', () => {
  const dead: DependencyCheck = {
    name: 'postgres',
    check: async () => ({ ok: false, detail: 'connection refused' }),
  };
  const alive: DependencyCheck = { name: 'redis', check: async () => ({ ok: true }) };

  it('liveness ignores a dead dependency', async () => {
    const server = await start({ dependencies: [dead] });
    const res = await server.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(res.json()).status).toBe('ok');
  });

  it('readiness fails and names the failing dependency', async () => {
    const server = await start({ dependencies: [dead, alive] });
    const res = await server.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    const body = ReadyResponseSchema.parse(res.json());
    expect(body.status).toBe('not-ready');
    expect(body.dependencies.find((d) => d.name === 'postgres')?.detail).toContain('connection refused');
    expect(body.dependencies.find((d) => d.name === 'redis')?.ok).toBe(true);
  });

  it('readiness reports the scheduler version this instance runs', async () => {
    const server = await start({ dependencies: [alive] });
    const body = ReadyResponseSchema.parse((await server.inject({ method: 'GET', url: '/readyz' })).json());
    expect(body.schedulerVersion).toBe(SCHEDULER_VERSION);
  });

  it('a dependency check that throws is a failure, not a crash', async () => {
    const server = await start({
      dependencies: [{ name: 'flaky', check: async () => { throw new Error('boom'); } }],
    });
    const res = await server.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(ReadyResponseSchema.parse(res.json()).dependencies[0]!.detail).toContain('boom');
  });

  it('is ready with no dependencies registered', async () => {
    const server = await start();
    expect((await server.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
  });
});

describe('the authoritative clock', () => {
  it('returns server time a client can derive an offset from', async () => {
    const server = await start({ now: () => 1_789_000_000_000 });
    const res = await server.inject({ method: 'GET', url: '/v1/time' });
    expect(res.statusCode).toBe(200);
    const body = TimeResponseSchema.parse(res.json());
    expect(body.serverTimeMs).toBe(1_789_000_000_000);
    expect(Date.parse(body.iso)).toBe(body.serverTimeMs);
  });

  it('needs no credentials, because a client needs the offset before it has a token', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/v1/time' });
    expect(res.statusCode).toBe(200);
  });
});

describe('the error model', () => {
  it('gives a known failure a stable code', () => {
    const { status, body } = toErrorBody(new ApiError('session_not_found', 'no such session'), 'r1');
    expect(status).toBe(404);
    expect(ErrorBodySchema.parse(body).error.code).toBe('session_not_found');
  });

  it('does not leak internals from an unexpected throw', () => {
    const { status, body, internal } = toErrorBody(new Error('column "foo" does not exist'), 'r2');
    expect(status).toBe(500);
    expect(body.error.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('column');
    expect(internal).toBeInstanceOf(Error);
  });

  it('names the field path on a validation failure', () => {
    const { status, body } = toErrorBody(
      { validation: [{ instancePath: '/timeBudgetMin', message: 'must be integer' }] },
      'r3',
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.details?.[0]).toEqual({ path: 'timeBudgetMin', message: 'must be integer' });
  });

  it('returns the envelope on an unknown route', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(ErrorBodySchema.parse(res.json()).error.code).toBe('not_found');
  });
});

describe('request correlation', () => {
  it('returns a generated id on every response', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers[REQUEST_ID_HEADER]).toBeTruthy();
  });

  it('honours a caller-supplied id', async () => {
    const server = await start();
    const res = await server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { [REQUEST_ID_HEADER]: 'trace-abc-123' },
    });
    expect(res.headers[REQUEST_ID_HEADER]).toBe('trace-abc-123');
  });

  it('puts the id in the error body so a screenshot is enough to find the logs', async () => {
    const server = await start();
    const res = await server.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: { [REQUEST_ID_HEADER]: 'trace-xyz' },
    });
    expect(res.json().error.requestId).toBe('trace-xyz');
  });
});

// scan-secrets-ignore: synthetic key, the fixture the redaction test exists to redact
const syntheticAnthropicKey = 'sk-ant-api03-AAAABBBBCCCCDDDD';

describe('logs never contain secrets', () => {
  it('redacts a registered secret whatever field it arrives under', () => {
    registerSecretValue('live-secret-value-abcdef');
    const { logger, lines } = createCapturingLogger();
    logger.info({ innocuousField: 'live-secret-value-abcdef' }, 'provider call failed');
    expect(JSON.stringify(lines())).not.toContain('live-secret-value-abcdef');
    expect(JSON.stringify(lines())).toContain('[redacted]');
  });

  it('redacts an authorization header', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ req: { headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def' } } }, 'request');
    expect(JSON.stringify(lines())).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts a key inside a free-text field', () => {
    const { logger, lines } = createCapturingLogger();
    logger.error({ detail: `failed using ${syntheticAnthropicKey}` }, 'provider call failed');
    expect(JSON.stringify(lines())).not.toContain(syntheticAnthropicKey);
    expect(JSON.stringify(lines())).toContain('[redacted]');
  });

  it('redacts a key written into the log message itself', () => {
    // The likeliest accidental leak: a hurried debug line interpolating the credential.
    const { logger, lines } = createCapturingLogger();
    logger.error(`failed using ${syntheticAnthropicKey}`);
    expect(JSON.stringify(lines())).not.toContain(syntheticAnthropicKey);
    expect(JSON.stringify(lines())).toContain('[redacted]');
  });
});

describe('the entry point wires what the server needs', () => {
  /**
   * A regression guard for a real gap: `buildServer` registers the identity routes only
   * when handed `db` and `jwtSecret`, the test harness always passes them, and `index.ts`
   * did not. Everything passed, and `POST /v1/devices` was a 404 on the first real boot.
   */
  it('passes db and jwtSecret to buildServer when it has them', () => {
    const src = readFileSync(path.join(process.cwd(), 'apps/api/src/index.ts'), 'utf8');
    expect(src).toContain('buildServer({');
    // Both are conditional now — storage is degradable, so an API serving only the cooking
    // pipeline starts without them. What must stay true is that when they exist they are
    // handed over, which is the thing that was once simply forgotten.
    expect(src).toMatch(/db:\s*database\.db/);
    expect(src).toMatch(/jwtSecret:\s*secrets\.get\('JWT_SECRET'\)/);
  });

  it('names what is lost when storage is absent, rather than failing to start', () => {
    const src = readFileSync(path.join(process.cwd(), 'apps/api/src/index.ts'), 'utf8');
    expect(src).toContain('degradable');
    // The operator has to be told which features are off, by name.
    expect(src).toMatch(/DATABASE_URL:\s*'[^']*sessions[^']*'/);
  });

  it('says so loudly when sessions are kept in memory rather than a database', async () => {
    const src = readFileSync(path.join(process.cwd(), 'apps/api/src/server.ts'), 'utf8');
    expect(src).toContain('sessions and devices are kept in memory on this instance');
    // And the routes exist regardless: a server with no database is a server, not a 404.
    const server = await start();
    const res = await server.inject({ method: 'POST', url: '/v1/devices', payload: {} });
    expect(res.statusCode).toBe(201);
  });
});

describe('the API describes itself from the contract', () => {
  it('documents every registered route', async () => {
    const server = await start();
    const spec = (await server.inject({ method: 'GET', url: '/openapi.json' })).json();
    for (const route of allRoutes()) {
      expect(spec.paths[route.path], route.path).toBeDefined();
      expect(spec.paths[route.path][route.method.toLowerCase()]).toBeDefined();
    }
  });

  it('derives response shapes from the contract schemas', async () => {
    const server = await start();
    const spec = (await server.inject({ method: 'GET', url: '/openapi.json' })).json();
    const timeSchema = spec.paths['/v1/time'].get.responses['200'].content['application/json'].schema;
    expect(Object.keys(timeSchema.properties)).toEqual(expect.arrayContaining(['serverTimeMs', 'iso']));
  });

  it('says which routes need a token and which do not', async () => {
    const server = await start();
    const spec = (await server.inject({ method: 'GET', url: '/openapi.json' })).json();
    expect(spec.paths['/v1/time'].get.security).toEqual([]);
  });

  it('admits every route can fail unexpectedly', async () => {
    const server = await start();
    const spec = (await server.inject({ method: 'GET', url: '/openapi.json' })).json();
    for (const route of allRoutes()) {
      expect(spec.paths[route.path][route.method.toLowerCase()].responses['500'], route.path).toBeDefined();
    }
  });
});
