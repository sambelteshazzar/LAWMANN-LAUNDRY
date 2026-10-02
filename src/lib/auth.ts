import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Staff PIN authentication, the POS industry standard. Deliberately small:
 * scrypt hashes, one signed cookie, a wrong-PIN throttle. No password
 * resets, no email loop, no sessions table — a laundry counter needs a
 * person to prove who they are in two seconds, and the owner needs to be
 * able to revoke that with one PIN change.
 *
 * The crypto is pure so it is testable; the Next.js glue that reads the
 * cookie and loads the staff row lives in src/lib/session.ts.
 */

export const SESSION_COOKIE = 'lawmann_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Role = 'owner' | 'counter' | 'collector';

export interface Session {
  staffId: string;
  name: string;
  role: Role;
  shopId: string;
}

const SCRYPT_KEYLEN = 32;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

/** `${staffId}.${expMs}.${hmac(staffId.expMs)}`. */
export function signSession(staffId: string, secret: string, now = Date.now()): string {
  const exp = now + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${staffId}.${exp}`;
  const mac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

export function parseSession(token: string | undefined, secret: string, now = Date.now()): { staffId: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [staffId, expRaw, mac] = parts as [string, string, string];
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= now) return null;
  const expected = createHmac('sha256', secret).update(`${staffId}.${expRaw}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(mac, 'hex');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { staffId };
}

const DEV_SECRET = 'lawmann-dev-secret-set-SESSION_SECRET-in-production';

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (secret) console.warn('SESSION_SECRET is shorter than 16 characters; using the dev secret instead.');
  if (!secret) console.warn(`SESSION_SECRET is not set; using the development secret. Set it before the owner demo.`);
  return DEV_SECRET;
}

/** In-process wrong-PIN throttle. Three failures pause that staff member's logins. */
const THROTTLE_MAX_FAILURES = 3;
const THROTTLE_PAUSE_MS = 30_000;

interface ThrottleEntry {
  failures: number;
  lockedUntil: number;
}

const g = globalThis as typeof globalThis & { __lawmannThrottle?: Map<string, ThrottleEntry> };
const throttle: Map<string, ThrottleEntry> = (g.__lawmannThrottle ??= new Map());

/** Seconds remaining on the lock, or null when the door is open. */
export function checkThrottle(staffId: string, now = Date.now()): number | null {
  const entry = throttle.get(staffId);
  if (!entry || entry.lockedUntil <= now) return null;
  return Math.ceil((entry.lockedUntil - now) / 1000);
}

export function noteFailure(staffId: string, now = Date.now()): void {
  const entry = throttle.get(staffId) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= THROTTLE_MAX_FAILURES) {
    entry.lockedUntil = now + THROTTLE_PAUSE_MS;
    entry.failures = 0;
  }
  throttle.set(staffId, entry);
}

export function resetFailures(staffId: string): void {
  throttle.delete(staffId);
}
