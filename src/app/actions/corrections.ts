'use server';

import { revalidatePath } from 'next/cache';
import { canCorrect, correctOrder } from '@/lib/corrections';
import { getDb, ensureBooted } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { correctionSchema, ghsToPesewas, kgToGrams } from '@/lib/validation';

export interface CorrectionState {
  ok: boolean;
  error?: string;
  summary?: string;
}

export async function correctOrderAction(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (!canCorrect(session.role)) {
    return { ok: false, error: 'Only the counter or owner corrects a recorded order.' };
  }

  const parsed = correctionSchema.safeParse({
    orderId: formData.get('orderId'),
    method: formData.get('method'),
    weightKg: formData.get('weightKg') ?? '',
    totalGhs: formData.get('totalGhs') ?? '',
    phone: formData.get('phone'),
    locationId: formData.get('locationId'),
    promisedOn: formData.get('promisedOn') ?? '',
    note: formData.get('note'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the correction.' };
  }

  const weightGrams = parsed.data.weightKg ? kgToGrams(parsed.data.weightKg) : null;
  const totalPesewa = parsed.data.totalGhs ? ghsToPesewas(parsed.data.totalGhs) : null;

  await ensureBooted();
  const result = await correctOrder(
    getDb(),
    parsed.data.orderId,
    {
      method: parsed.data.method,
      weightGrams,
      totalPesewa,
      phone: parsed.data.phone,
      locationId: parsed.data.locationId,
      promisedOn: parsed.data.promisedOn || null,
      note: parsed.data.note,
    },
    session,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/app/orders/${parsed.data.orderId}`);
  revalidatePath('/app/orders');
  revalidatePath('/app/arrears');
  revalidatePath('/app/activity');
  revalidatePath('/app/messages');
  revalidatePath('/app/reports');
  return { ok: true, summary: result.summary };
}
