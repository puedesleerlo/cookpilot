// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  CreateDeviceResponseSchema,
  ErrorBodySchema,
  WhoAmIResponseSchema,
} from '@kitchen/contracts';
import { createDb, type DbHandle } from '../db/client';
import { runMigrations } from '../db/migrate';
import { devices, sessionMembers, sessions } from '../db/schema';
import { buildServer } from '../server';
import { parseEnv } from '../config/env';
import {
  bearerFrom,
  hashToken,
  isHost,
  isMember,
  issueDevice,
  requireHost,
  requireMember,
  revokeDevice,
  verifyDevice,
} from './devices';

const DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgresql://kc:kc@localhost:55432/kc';
// scan-secrets-ignore: a test signing key, never used anywhere real
const SECRET = 'test-signing-key-at-least-32-chars-long';

let handle: DbHandle | null = null;
let app: FastifyInstance | null = null;
let reachable = false;

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

const start = async (rateLimits?: { globalPerMinute: number; deviceCreationPerHour: number }) => {
  await app?.close();
  app = await buildServer({
    env: parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    db: db(),
    jwtSecret: SECRET,
    ...(rateLimits ? { rateLimits } : {}),
  });
  return app;
};

beforeEach(async () => {
  if (!reachable) return;
  await db().execute(sql`TRUNCATE session_members, sessions, devices CASCADE`);
});

describe('identity is a device, and it is anonymous', () => {
  dbIt('issues a token with no account and no personal data', async () => {
    const server = await start();
    const res = await server.inject({ method: 'POST', url: '/v1/devices', payload: {} });
    expect(res.statusCode).toBe(201);
    const body = CreateDeviceResponseSchema.parse(res.json());
    expect(body.deviceId).toMatch(/^dev_[0-9a-f]{32}$/);
    expect(body.token.split('.')).toHaveLength(3);
  });

  dbIt('carries only a subject and timestamps in its claims', async () => {
    const { token } = await issueDevice(db(), SECRET);
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
    expect(JSON.stringify(claims)).not.toMatch(/email|name|phone/i);
  });
});

describe('only a hash of the token is stored', () => {
  dbIt('stores no value that can be presented as a token', async () => {
    const { token, deviceId } = await issueDevice(db(), SECRET);
    const rows = await db().select().from(devices);
    const stored = rows.find((r) => r.id === deviceId)!;
    expect(stored.anonTokenHash).not.toBe(token);
    expect(stored.anonTokenHash).toBe(hashToken(token));
    // Nothing in the row resembles a JWT.
    expect(JSON.stringify(stored)).not.toContain(token.split('.')[2]);
  });

  dbIt('still resolves the right device from a valid token', async () => {
    const a = await issueDevice(db(), SECRET);
    const b = await issueDevice(db(), SECRET);
    expect((await verifyDevice(db(), SECRET, a.token)).deviceId).toBe(a.deviceId);
    expect((await verifyDevice(db(), SECRET, b.token)).deviceId).toBe(b.deviceId);
  });
});

describe('verification fails closed', () => {
  dbIt('rejects a token signed with a different key', async () => {
    const { deviceId } = await issueDevice(db(), SECRET);
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(deviceId)
      .setIssuer('kitchen-compiler')
      .setAudience('device')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-signing-key-xx'));
    await expect(verifyDevice(db(), SECRET, forged)).rejects.toThrow(/not valid/);
  });

  dbIt('rejects an expired token', async () => {
    const past = () => Date.now() - 200 * 24 * 60 * 60 * 1000;
    const { token } = await issueDevice(db(), SECRET, past);
    await expect(verifyDevice(db(), SECRET, token)).rejects.toThrow(/not valid/);
  });

  dbIt('rejects a token for a revoked device, even though it verifies cryptographically', async () => {
    const { token, deviceId } = await issueDevice(db(), SECRET);
    expect((await verifyDevice(db(), SECRET, token)).deviceId).toBe(deviceId);
    await revokeDevice(db(), deviceId);
    await expect(verifyDevice(db(), SECRET, token)).rejects.toThrow(/not valid/);
  });

  dbIt('rejects a missing token on a protected route, and never runs the handler', async () => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/v1/devices/me' });
    expect(res.statusCode).toBe(401);
    expect(ErrorBodySchema.parse(res.json()).error.code).toBe('unauthorized');
  });

  dbIt('accepts a valid token on a protected route', async () => {
    const server = await start();
    const { token, deviceId } = await issueDevice(db(), SECRET);
    const res = await server.inject({
      method: 'GET',
      url: '/v1/devices/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(WhoAmIResponseSchema.parse(res.json()).deviceId).toBe(deviceId);
  });

  dbIt('leaves unauthenticated routes reachable', async () => {
    const server = await start();
    expect((await server.inject({ method: 'GET', url: '/v1/time' })).statusCode).toBe(200);
  });

  dbIt('does not tell a prober whether a token was forged or merely expired', async () => {
    const expiredPast = () => Date.now() - 200 * 24 * 60 * 60 * 1000;
    const { token: expired } = await issueDevice(db(), SECRET, expiredPast);
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('dev_nope')
      .setIssuer('kitchen-compiler')
      .setAudience('device')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('another-wrong-signing-key-xxxxxxxxxx'));

    const messages = await Promise.all(
      [expired, forged].map((t) => verifyDevice(db(), SECRET, t).catch((e: Error) => e.message)),
    );
    expect(messages[0]).toBe(messages[1]);
  });

  it('parses a bearer header, and refuses anything else', () => {
    expect(bearerFrom('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerFrom('bearer abc')).toBe('abc');
    expect(bearerFrom('Basic abc')).toBeUndefined();
    expect(bearerFrom(undefined)).toBeUndefined();
  });
});

describe('authorization distinguishes a member from the host', () => {
  const setUp = async () => {
    const host = await issueDevice(db(), SECRET);
    const guest = await issueDevice(db(), SECRET);
    const stranger = await issueDevice(db(), SECRET);
    await db().insert(sessions).values({
      id: 'sess-1',
      joinCode: 'ABC234',
      hostDeviceId: host.deviceId,
      inputs: {},
      schedulerVersion: '0.1.0',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await db().insert(sessionMembers).values([
      { sessionId: 'sess-1', deviceId: host.deviceId, cookId: 'cook-1', displayName: 'Host' },
      { sessionId: 'sess-1', deviceId: guest.deviceId, cookId: 'cook-2', displayName: 'Guest' },
    ]);
    return { host, guest, stranger };
  };

  dbIt('refuses a non-member', async () => {
    const { stranger } = await setUp();
    expect(await isMember(db(), 'sess-1', stranger.deviceId)).toBe(false);
    await expect(requireMember(db(), 'sess-1', stranger.deviceId)).rejects.toThrow(/not part of/);
  });

  dbIt('allows a member to act on tasks', async () => {
    const { guest } = await setUp();
    expect(await isMember(db(), 'sess-1', guest.deviceId)).toBe(true);
    await expect(requireMember(db(), 'sess-1', guest.deviceId)).resolves.toBeUndefined();
  });

  dbIt('restricts constraint changes to the host', async () => {
    const { host, guest } = await setUp();
    expect(await isHost(db(), 'sess-1', host.deviceId)).toBe(true);
    expect(await isHost(db(), 'sess-1', guest.deviceId)).toBe(false);
    await expect(requireHost(db(), 'sess-1', host.deviceId)).resolves.toBeUndefined();
    await expect(requireHost(db(), 'sess-1', guest.deviceId)).rejects.toThrow(/started the session/);
  });

  dbIt('holds when the API is called directly, not only through a client', async () => {
    const { guest } = await setUp();
    // No interface involved: the check is in the authorization layer, not the screen.
    await expect(requireHost(db(), 'sess-1', guest.deviceId)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('rate limiting', () => {
  dbIt('throttles device creation more tightly than ordinary requests', async () => {
    const server = await start({ globalPerMinute: 1000, deviceCreationPerHour: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await server.inject({ method: 'POST', url: '/v1/devices', payload: {} });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 3)).toEqual([201, 201, 201]);
    expect(codes[3]).toBe(429);
    const last = await server.inject({ method: 'POST', url: '/v1/devices', payload: {} });
    expect(last.headers['retry-after']).toBeDefined();
    expect(ErrorBodySchema.parse(last.json()).error.code).toBe('rate_limited');
  });

  dbIt('does not throttle an ordinary session\'s worth of authenticated requests', async () => {
    const server = await start({ globalPerMinute: 300, deviceCreationPerHour: 20 });
    const { token } = await issueDevice(db(), SECRET);
    const codes: number[] = [];
    for (let i = 0; i < 40; i++) {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/devices/me',
        headers: { authorization: `Bearer ${token}` },
      });
      codes.push(res.statusCode);
    }
    expect(new Set(codes)).toEqual(new Set([200]));
  }, 30_000);
});
