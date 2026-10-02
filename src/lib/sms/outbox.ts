import { eq } from 'drizzle-orm';
import { smsMessage } from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import { arkeselKey, sendViaArkesel } from './arkesel';

/**
 * The transactional outbox. Every message is written queued before any send
 * is attempted, so intent can never be lost to a dropped network. A send is
 * attempted at action time; failures stay visible in /messages with their
 * reason and a retry button. Nothing is ever faked as sent.
 */

export type SmsKind = 'accepted' | 'ready' | 'payment';

export interface EnqueueInput {
  shopId: string;
  orderId: string | null;
  kind: SmsKind;
  toPhone: string;
  body: string;
}

export async function enqueueSms(db: Db, input: EnqueueInput): Promise<string> {
  const rows = await db.insert(smsMessage).values(input).returning({ id: smsMessage.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('enqueueSms failed to record the message');
  return id;
}

export async function sendQueued(db: Db, limit = 50): Promise<{ sent: number; failed: number }> {
  if (!arkeselKey()) return { sent: 0, failed: 0 };
  const queued = await db
    .select()
    .from(smsMessage)
    .where(eq(smsMessage.state, 'queued'))
    .orderBy(smsMessage.createdAt)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const msg of queued) {
    const result = await sendViaArkesel(msg.toPhone, msg.body);
    if (result.ok) {
      await db
        .update(smsMessage)
        .set({ state: 'sent', provider: 'arkesel', providerRef: result.ref ?? null, error: null, sentAt: new Date() })
        .where(eq(smsMessage.id, msg.id));
      sent += 1;
    } else {
      await db
        .update(smsMessage)
        .set({ state: 'failed', error: result.error })
        .where(eq(smsMessage.id, msg.id));
      failed += 1;
    }
  }
  return { sent, failed };
}

/**
 * Fire-and-forget after an action completes. Intent is already recorded, so
 * a failure here changes nothing visible except the outbox state — the
 * caller's result must never depend on the network.
 */
export async function attemptSend(db: Db): Promise<void> {
  try {
    await sendQueued(db);
  } catch {
    // Queued rows remain queued; the outbox page retries them.
  }
}
