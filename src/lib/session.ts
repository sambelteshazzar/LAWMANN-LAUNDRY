import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { staff } from '@/lib/db/schema';
import { parseSession, sessionSecret, SESSION_COOKIE, type Session } from '@/lib/auth';

/**
 * The only file that may read the session cookie. A session dies when the
 * staff row or its PIN does, so a fired collector or a revoked PIN loses
 * access on the next request, not at cookie expiry.
 */

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const parsed = parseSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!parsed) return null;

  await ensureBooted();
  const rows = await getDb().select().from(staff).where(eq(staff.id, parsed.staffId));
  const person = rows[0];
  if (!person || !person.pinHash) return null;
  return { staffId: person.id, name: person.name, role: person.role, shopId: person.shopId };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}

export function canSeeMoney(role: Session['role']): boolean {
  return role === 'owner' || role === 'counter';
}

export function canManageStaff(role: Session['role']): boolean {
  return role === 'owner';
}
