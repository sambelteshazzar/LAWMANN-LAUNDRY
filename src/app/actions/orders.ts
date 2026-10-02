'use server';

import { revalidatePath } from 'next/cache';
import { getDb, ensureBooted } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { createOrder, findStudentByPhone } from '@/lib/orders';
import { intakeSchema, normalizePhone } from '@/lib/validation';

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
  revalidatePath('/orders');
  revalidatePath('/arrears');
  revalidatePath('/messages');
  revalidatePath('/');
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
