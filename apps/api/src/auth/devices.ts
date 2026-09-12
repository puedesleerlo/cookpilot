import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { sessionMembers, sessions } from '../db/schema';
import { postgresSessionStore, type SessionStore } from '../sessions/store';
import { ApiError } from '../errors';

/**
 * Anonymous device identity.
 *
 * There are no accounts, so identity is a device. That still has to be real rather than a
 * client-supplied id, because the session rules turn on it: any member may say "I finished
 * my task", but only the host may change the constraints and force a recompile. Two cooks
 * fighting over the plan is a worse failure than one of them being unable to change it —
 * so if a device could simply claim to be the host, that rule would be decorative.
 *
 * What is deliberately absent: any personal data. The token's claims are a device id and
 * two timestamps.
 */

export const DEVICE_TOKEN_TTL_DAYS = 90;
const ALG = 'HS256';
const ISSUER = 'kitchen-compiler';
const AUDIENCE = 'device';

export type DeviceClaims = JWTPayload & { sub: string };

export type IssuedDevice = { deviceId: string; token: string; expiresAt: Date };

/**
 * Only a hash is stored. A database dump of this table must not be a set of working
 * credentials — the same reason nobody stores passwords in plaintext, applied to the thing
 * that is functionally a password here.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const key = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export const issueDeviceWith = async (
  store: SessionStore,
  secret: string,
  now: () => number = () => Date.now(),
): Promise<IssuedDevice> => {
  const deviceId = `dev_${randomBytes(16).toString('hex')}`;
  const issuedAt = Math.floor(now() / 1000);
  const expiresAt = issuedAt + DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60;

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(deviceId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(key(secret));

  await store.insertDevice({ id: deviceId, anonTokenHash: hashToken(token) }, new Date(now()));

  return { deviceId, token, expiresAt: new Date(expiresAt * 1000) };
};

export const issueDevice = (
  db: Database,
  secret: string,
  now: () => number = () => Date.now(),
): Promise<IssuedDevice> => issueDeviceWith(postgresSessionStore(db), secret, now);

export type VerifiedDevice = { deviceId: string };

/**
 * Fails closed on every path: bad signature, expiry, wrong issuer, and — the one that is
 * easy to miss — a token that verifies cryptographically but names a device that has since
 * been deleted. Revocation is deleting the row, so that last check is what makes revocation
 * mean anything.
 */
export const verifyDeviceWith = async (
  store: SessionStore,
  secret: string,
  token: string | undefined,
): Promise<VerifiedDevice> => {
  if (!token || token.length === 0) {
    throw new ApiError('unauthorized', 'This endpoint needs a device token.');
  }

  let claims: DeviceClaims;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALG],
    });
    if (typeof payload.sub !== 'string') throw new Error('no subject');
    claims = payload as DeviceClaims;
  } catch {
    // Deliberately uniform: distinguishing "expired" from "forged" tells a prober which
    // of the two they achieved.
    throw new ApiError('unauthorized', 'That device token is not valid.');
  }

  const row = await store.findDevice(claims.sub);
  if (!row || row.anonTokenHash !== hashToken(token)) {
    throw new ApiError('unauthorized', 'That device token is not valid.');
  }

  return { deviceId: claims.sub };
};

export const verifyDevice = (
  db: Database,
  secret: string,
  token: string | undefined,
): Promise<VerifiedDevice> => verifyDeviceWith(postgresSessionStore(db), secret, token);

export const touchDevice = (db: Database, deviceId: string, at: Date): Promise<void> =>
  postgresSessionStore(db).touchDevice(deviceId, at);

/** Revocation is deleting the row. `verifyDevice` checks for it on every request. */
export const revokeDevice = (db: Database, deviceId: string): Promise<void> =>
  postgresSessionStore(db).deleteDevice(deviceId);

// ------------------------------------------------------------ authorization

export const isMember = async (
  db: Database,
  sessionId: string,
  deviceId: string,
): Promise<boolean> => {
  const [row] = await db
    .select({ deviceId: sessionMembers.deviceId })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.deviceId, deviceId)))
    .limit(1);
  return row !== undefined;
};

export const isHost = async (
  db: Database,
  sessionId: string,
  deviceId: string,
): Promise<boolean> => {
  const [row] = await db
    .select({ hostDeviceId: sessions.hostDeviceId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row?.hostDeviceId === deviceId;
};

export const requireMember = async (
  db: Database,
  sessionId: string,
  deviceId: string,
): Promise<void> => {
  if (!(await isMember(db, sessionId, deviceId))) {
    throw new ApiError('forbidden', 'This device is not part of that session.');
  }
};

/**
 * Structural changes need one owner. Without this, two cooks can each drag the plan in a
 * different direction and neither gets the session they wanted.
 */
export const requireHost = async (
  db: Database,
  sessionId: string,
  deviceId: string,
): Promise<void> => {
  if (!(await isHost(db, sessionId, deviceId))) {
    throw new ApiError('forbidden', 'Only whoever started the session can change the plan.');
  }
};

export const bearerFrom = (header: string | string[] | undefined): string | undefined => {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
};
