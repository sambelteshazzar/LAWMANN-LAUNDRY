'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { smsMessage } from '@/lib/db/schema';
import { canManageStaff, requireSession } from '@/lib/session';
import { addCost } from '@/lib/costs';
import { closeShift, openShift, type ShiftClose } from '@/lib/shifts';
import { sendQueued } from '@/lib/sms/outbox';
import { costSchema, shiftCloseSchema, shiftOpenSchema } from '@/lib/validation';
import type { ActionState } from './auth';

function refreshOps(): void {
  revalidatePath('/app/costs');
  revalidatePath('/app/reports');
  revalidatePath('/app/shifts');
  revalidatePath('/app/messages');
  revalidatePath('/app/activity');
  revalidatePath('/app');
}

export async function addCostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (session.role === 'collector') return { ok: false, error: 'Only the counter or owner records costs.' };
  const parsed = costSchema.safeParse({
    category: formData.get('category'),
    label: formData.get('label') ?? '',
    amount: formData.get('amount'),
    incurredOn: formData.get('incurredOn'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the bill.' };
  }
  await ensureBooted();
  const result = await addCost(getDb(), parsed.data, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOps();
  return { ok: true };
}

export async function openShiftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  const parsed = shiftOpenSchema.safeParse({ float: formData.get('float') });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter the float.' };
  }
  await ensureBooted();
  const result = await openShift(getDb(), parsed.data, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOps();
  return { ok: true };
}

export interface CloseShiftState {
  ok: boolean;
  error?: string;
  close?: ShiftClose;
}

export async function closeShiftAction(_prev: CloseShiftState, formData: FormData): Promise<CloseShiftState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  const shiftId = String(formData.get('shiftId') ?? '');
  const momoRaw = formData.get('momoAtClose');
  const parsed = shiftCloseSchema.safeParse({
    counted: formData.get('counted'),
    momoAtClose: typeof momoRaw === 'string' && momoRaw.trim() ? momoRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Count the drawer first.' };
  }
  if (!shiftId) return { ok: false, error: 'No open shift.' };
  await ensureBooted();
  const result = await closeShift(getDb(), shiftId, parsed.data, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOps();
  return { ok: true, close: result.close };
}

export async function sendAllAction(_prev: ActionState): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (session.role === 'collector') return { ok: false, error: 'Only the counter or owner sends messages.' };
  await ensureBooted();
  await sendQueued(getDb());
  refreshOps();
  return { ok: true };
}

export async function deleteMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner deletes messages.' };
  const messageId = String(formData.get('messageId') ?? '');
  if (!messageId) return { ok: false, error: 'Pick a message first.' };
  await ensureBooted();
  await getDb()
    .delete(smsMessage)
    .where(and(eq(smsMessage.id, messageId), eq(smsMessage.shopId, session.shopId)));
  refreshOps();
  return { ok: true };
}

export async function clearSentMessagesAction(_prev: ActionState): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (!canManageStaff(session.role)) return { ok: false, error: 'Only the owner clears messages.' };
  await ensureBooted();
  await getDb()
    .delete(smsMessage)
    .where(and(eq(smsMessage.shopId, session.shopId), inArray(smsMessage.state, ['sent', 'failed'])));
  refreshOps();
  return { ok: true };
}
