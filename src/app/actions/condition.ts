'use server';

import { revalidatePath } from 'next/cache';
import { addConditionPhoto, canPhotograph } from '@/lib/condition';
import { getDb, ensureBooted } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { conditionPhotoSchema } from '@/lib/validation';

export interface ConditionState {
  ok: boolean;
  error?: string;
}

export async function addConditionPhotoAction(_prev: ConditionState, formData: FormData): Promise<ConditionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'Sign in again.' };
  }
  if (!canPhotograph(session.role)) {
    return { ok: false, error: 'Only staff photograph an item.' };
  }

  const parsed = conditionPhotoSchema.safeParse({
    orderId: formData.get('orderId'),
    note: formData.get('note'),
    image: formData.get('image'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the photograph.' };
  }

  await ensureBooted();
  const result = await addConditionPhoto(getDb(), parsed.data.orderId, parsed.data, session);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/app/orders/${parsed.data.orderId}`);
  return { ok: true };
}
