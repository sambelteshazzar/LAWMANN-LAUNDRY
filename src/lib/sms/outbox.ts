import { and, eq, lt, or } from 'drizzle-orm';
import { smsMessage } from '@/lib/db/schema';
import type { Db, Writable } from '@/lib/db';
import { arkeselKey, sendViaArkesel } from './arkesel';

/**
 * The transactional outbox. Every message is written queued before any send
 * is attempted, so intent can never be lost to a dropped network. A send is
 * attempted at action time; failures stay visible in /messages with their
 * reason and can be sent again, by hand or on their own once they have had
 * time to clear. Nothing is ever faked as sent.
 */

export type SmsKind = 'accepted' | 'ready' | 'payment' | 'corrected';

export interface EnqueueInput {
  shopId: string;
  orderId: string | null;
  kind: SmsKind;
  toPhone: string;
  body: string;
}

/**
 * A refusal is retried, but not straight away: a gateway that has just said
 * no — a low balance, a blip — gets a few minutes to recover before it is
 * asked again. The row's own age is the clock, so an attempt count would buy
 * nothing. Retries only ever fire from an action taken in the app, so a
 * permanently dead key cannot spin on its own.
 */
export const RETRY_AFTER_MS = 5 * 60 * 1000;

export async function enqueueSms(db: Writable, input: EnqueueInput): Promise<string> {
  const rows = await db.insert(smsMessage).values(input).returning({ id: smsMessage.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('enqueueSms failed to record the message');
  return id;
}

export async function sendQueued(db: Db, limit = 50): Promise<{ sent: number; failed: number }> {
  if (!arkeselKey()) return { sent: 0, failed: 0 };
  // A refusal is not a verdict. A row that failed joins the queued ones once
  // it has had time to clear, which is what stops a single "insufficient
  // balance" from leaving a student never told their bag is ready.
  const readyAgain = new Date(Date.now() - RETRY_AFTER_MS);
  const due = await db
    .select()
    .from(smsMessage)
    .where(or(eq(smsMessage.state, 'queued'), and(eq(smsMessage.state, 'failed'), lt(smsMessage.createdAt, readyAgain))))
    .orderBy(smsMessage.createdAt)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const msg of due) {
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
