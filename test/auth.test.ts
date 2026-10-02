import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_COOKIE,
  checkThrottle,
  hashPin,
  noteFailure,
  parseSession,
  resetFailures,
  signSession,
  verifyPin,
} from '@/lib/auth';

describe('PIN hashing', () => {
  it('stores a scrypt hash, never the PIN', () => {
    const stored = hashPin('1234');
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(stored).not.toContain('1234');
  });

  it('hashes are salted: the same PIN twice gives different hashes, both verify', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a).not.toBe(b);
    expect(verifyPin('1234', a)).toBe(true);
    expect(verifyPin('1234', b)).toBe(true);
  });

  it('a wrong PIN fails, and tampered or malformed stored values fail closed', () => {
    const stored = hashPin('1234');
    expect(verifyPin('1235', stored)).toBe(false);
    expect(verifyPin('1234', 'not:a:hash')).toBe(false);
    expect(verifyPin('1234', 'scrypt:zz:zz')).toBe(false);
    expect(verifyPin('1234', '')).toBe(false);
  });
});

describe('session token', () => {
  const secret = 'a-secret-at-least-16-chars';

  it('round-trips a staff id', () => {
    const token = signSession('staff-uuid-1', secret);
    expect(parseSession(token, secret)?.staffId).toBe('staff-uuid-1');
  });

  it('is bound to the secret', () => {
    const token = signSession('staff-uuid-1', secret);
    expect(parseSession(token, 'another-secret-16chars')).toBeNull();
  });

  it('rejects tampering with the payload or the mac', () => {
    const token = signSession('staff-uuid-1', secret);
    const parts = token.split('.');
    const forgedStaff = ['someone-else', parts[1]!, parts[2]!].join('.');
    expect(parseSession(forgedStaff, secret)).toBeNull();
    const forgedMac = [parts[0]!, parts[1]!, '0'.repeat(64)].join('.');
    expect(parseSession(forgedMac, secret)).toBeNull();
  });

  it('expires', () => {
    const now = 1_000_000_000_000;
    const token = signSession('staff-uuid-1', secret, now);
    const justBefore = now + 30 * 24 * 60 * 60 * 1000 - 1;
    expect(parseSession(token, secret, justBefore)).not.toBeNull();
    expect(parseSession(token, secret, justBefore + 2)).toBeNull();
  });

  it('rejects junk tokens and absence', () => {
    expect(parseSession(undefined, secret)).toBeNull();
    expect(parseSession('one.two', secret)).toBeNull();
    expect(parseSession('', secret)).toBeNull();
  });

  it('the cookie has its documented name', () => {
    expect(SESSION_COOKIE).toBe('lawmann_session');
  });
});

describe('wrong-PIN throttle', () => {
  const staffId = 'staff-throttle-test';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
    resetFailures(staffId);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('two failures leave the door open', () => {
    noteFailure(staffId);
    noteFailure(staffId);
    expect(checkThrottle(staffId)).toBeNull();
  });

  it('the third failure locks for 30 seconds, then reopens', () => {
    noteFailure(staffId);
    noteFailure(staffId);
    noteFailure(staffId);
    expect(checkThrottle(staffId)).toBe(30);
    vi.setSystemTime(new Date('2026-09-28T10:00:29Z'));
    expect(checkThrottle(staffId)).toBe(1);
    vi.setSystemTime(new Date('2026-09-28T10:00:31Z'));
    expect(checkThrottle(staffId)).toBeNull();
  });

  it('a successful login resets the count', () => {
    noteFailure(staffId);
    noteFailure(staffId);
    resetFailures(staffId);
    noteFailure(staffId);
    noteFailure(staffId);
    expect(checkThrottle(staffId)).toBeNull();
  });
});
