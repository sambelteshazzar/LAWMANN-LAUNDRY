'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb, ensureBooted } from '@/lib/db';
import { requireSession } from '@/lib/session';
import {
  advanceStatus,
  cancelOrder,
  confirmMomoPayment,
  createOrder,
  findStudentByPhone,
  takePayment,
  type OrderStatus,
} from '@/lib/orders';
import { intakeSchema, normalizePhone, paymentSchema } from '@/lib/validation';
import type { ActionState } from './auth';

export interface CreateOrderState {
  ok: boolean;
  error?: string;
  orderId?: string;
  orderNo?: string;
}

export async function createOrderAction(_prev: CreateOrderState, formData: FormData): Promise<CreateOrderState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }

  let pieces: unknown = [];
  try {
    pieces = JSON.parse(String(formData.get('piecesJson') ?? '[]'));
  } catch {
    return { ok: false, error: 'The item list is invalid. Pick the items again.' };
  }

  const paymentMethod = String(formData.get('paymentMethod') ?? 'none');
  const gatewayRaw = formData.get('gatewayRef');
  const promisedRaw = formData.get('promisedOn');

  const parsed = intakeSchema.safeParse({
    orderId: formData.get('orderId'),
    locationId: formData.get('locationId'),
    phone: formData.get('phone'),
    name: formData.get('name') ?? '',
    room: formData.get('room') ?? '',
    weightKg: formData.get('weightKg'),
    method: formData.get('method'),
    pieces,
    payment:
      paymentMethod === 'none'
        ? null
        : {
            method: paymentMethod,
            amount: formData.get('paymentAmount'),
            gatewayRef: typeof gatewayRaw === 'string' && gatewayRaw.trim() ? gatewayRaw : undefined,
          },
    promisedOn: typeof promisedRaw === 'string' && promisedRaw ? promisedRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  await ensureBooted();
  const result = await createOrder(getDb(), parsed.data, session);
  if (!result.ok) {
    return { ok: false, error: result.error, orderId: result.orderId, orderNo: result.orderNo };
  }
  revalidatePath('/app/orders');
  revalidatePath('/app/arrears');
  revalidatePath('/app/messages');
  revalidatePath('/app');
  return { ok: true, orderId: result.orderId, orderNo: result.orderNo };
}

export interface StudentLookupResult {
  found: boolean;
  name?: string | null;
  room?: string | null;
  openBalancePesewa?: number;
  oldestOrderNo?: string | null;
  error?: string;
}

/** Debounced from the intake form: is this a returning student, and do they owe? */
export async function lookupStudentAction(phone: string): Promise<StudentLookupResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { found: false, error: 'Sign in again.' };
  }
  if (!normalizePhone(phone)) return { found: false };
  await ensureBooted();
  const lookup = await findStudentByPhone(getDb(), session.shopId, phone);
  if (!lookup) return { found: false };
  return {
    found: true,
    name: lookup.student.name,
    room: lookup.student.room,
    openBalancePesewa: lookup.openBalancePesewa,
    oldestOrderNo: lookup.oldestOpen?.orderNo ?? null,
  };
}

const statusSchema = z.enum(['received', 'washing', 'ready', 'collected', 'cancelled']);

function refreshOrder(orderId: string): void {
  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath('/app/orders');
  revalidatePath('/app/arrears');
  revalidatePath('/app/messages');
  revalidatePath('/app/activity');
  revalidatePath('/app');
}

export async function advanceStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  const orderId = String(formData.get('orderId') ?? '');
  const to = statusSchema.safeParse(formData.get('to'));
  if (!orderId || !to.success) return { ok: false, error: 'That move is not valid.' };
  await ensureBooted();
  const result = await advanceStatus(getDb(), orderId, to.data as OrderStatus, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOrder(orderId);
  return { ok: true };
}

export async function takePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  const gatewayRaw = formData.get('gatewayRef');
  const parsed = paymentSchema.safeParse({
    orderId: formData.get('orderId'),
    method: formData.get('method'),
    amount: formData.get('amount'),
    gatewayRef: typeof gatewayRaw === 'string' && gatewayRaw.trim() ? gatewayRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the payment.' };
  }
  await ensureBooted();
  const result = await takePayment(getDb(), parsed.data.orderId, parsed.data, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOrder(parsed.data.orderId);
  return { ok: true };
}

export async function confirmMomoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (session.role === 'collector') return { ok: false, error: 'Only the counter or owner confirms MoMo.' };
  const paymentId = String(formData.get('paymentId') ?? '');
  if (!paymentId) return { ok: false, error: 'Pick a payment first.' };
  await ensureBooted();
  const result = await confirmMomoPayment(getDb(), paymentId, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOrder(result.orderId);
  return { ok: true };
}

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (session.role === 'collector') return { ok: false, error: 'Only the counter or owner cancels an order.' };
  const orderId = String(formData.get('orderId') ?? '');
  if (!orderId) return { ok: false, error: 'Pick an order first.' };
  await ensureBooted();
  const result = await cancelOrder(getDb(), orderId, session);
  if (!result.ok) return { ok: false, error: result.error };
  refreshOrder(orderId);
  return { ok: true };
}
