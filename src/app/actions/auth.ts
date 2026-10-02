'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNotNull } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { staff } from '@/lib/db/schema';
import { loginEligibleStaff, rowCanLogIn } from '@/lib/staff';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  checkThrottle,
  hashPin,
  noteFailure,
  resetFailures,
  sessionSecret,
  signSession,
  verifyPin,
} from '@/lib/auth';
import { canManageStaff, requireSession } from '@/lib/session';
import { loginSchema, staffSchema } from '@/lib/validation';

export interface ActionState {
  ok: boolean;
  error?: string;
}

const GENERIC_FAILURE = 'Name or PIN is wrong.';

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ staffId: formData.get('staffId'), pin: formData.get('pin') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE };

  const locked = checkThrottle(parsed.data.staffId);
  if (locked !== null) return { ok: false, error: `Too many wrong tries. Wait ${locked} seconds.` };

  await ensureBooted();
  const rows = await getDb().select().from(staff).where(eq(staff.id, parsed.data.staffId));
  const person = rows[0];
  if (!rowCanLogIn(person) || !verifyPin(parsed.data.pin, person.pinHash)) {
    noteFailure(parsed.data.staffId);
    return { ok: false, error: GENERIC_FAILURE };
  }
  resetFailures(person.id);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(person.id, sessionSecret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  redirect(person.role === 'collector' ? '/app/orders/new' : '/app');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/app/login');
}

export async function createStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner manages staff.' };

  const parsed = staffSchema.safeParse({
    name: formData.get('name'),
    role: formData.get('role'),
    pin: formData.get('pin'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };

  await ensureBooted();
  try {
    await getDb().insert(staff).values({
      shopId: session.shopId,
      name: parsed.data.name,
      role: parsed.data.role,
      pinHash: hashPin(parsed.data.pin),
    });
  } catch {
    return { ok: false, error: 'That name is already taken.' };
  }
  revalidatePath('/app/staff');
  return { ok: true };
}

export async function resetPinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner manages staff.' };

  const staffId = String(formData.get('staffId') ?? '');
  const pin = String(formData.get('pin') ?? '');
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: 'PIN is 4 to 8 digits.' };

  await ensureBooted();
  await getDb().update(staff).set({ pinHash: hashPin(pin) }).where(eq(staff.id, staffId));
  resetFailures(staffId);
  revalidatePath('/app/staff');
  return { ok: true };
}

export async function loginChoices(): Promise<Array<{ id: string; name: string; role: string }>> {
  await ensureBooted();
  return loginEligibleStaff(getDb());
}

export async function setStaffActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner manages staff.' };

  const staffId = String(formData.get('staffId') ?? '');
  const active = formData.get('active') === 'true';

  await ensureBooted();
  const db = getDb();
  if (staffId === session.staffId && !active) {
    return { ok: false, error: 'Move someone else first: you cannot move yourself to former staff.' };
  }
  if (!active) {
    const owners = await db
      .select({ id: staff.id })
      .from(staff)
      .where(
        and(
          eq(staff.shopId, session.shopId),
          eq(staff.role, 'owner'),
          eq(staff.active, true),
        ),
      );
    if (owners.length <= 1 && owners[0]?.id === staffId) {
      return { ok: false, error: 'The shop needs at least one working owner.' };
    }
  }
  await db
    .update(staff)
    .set({ active })
    .where(and(eq(staff.id, staffId), eq(staff.shopId, session.shopId)));
  revalidatePath('/app/staff');
  return { ok: true };
}
