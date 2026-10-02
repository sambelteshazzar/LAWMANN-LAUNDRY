import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { grams, pesewas } from '@/lib/money';
import {
  SMS_SEGMENT_LIMIT,
  acceptedMessage,
  paymentMessage,
  readyMessage,
} from '@/lib/sms/templates';
import { enqueueSms, sendQueued, attemptSend } from '@/lib/sms/outbox';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

describe('templates', () => {
  it('the accepted message carries weight, price, balance and order number', () => {
    expect(
      acceptedMessage({ name: 'Ama', weightGrams: grams(3500), grossPesewa: pesewas(9300), paidAllStatesPesewa: pesewas(5000), orderNo: 'LW-260928-003' }),
    ).toBe('Lawmann: bag received for Ama. 3.5kg, GH¢93. Balance owing GH¢43. Order LW-260928-003.');
  });

  it('an unnamed student still gets a readable message', () => {
    const body = acceptedMessage({ name: null, weightGrams: grams(2000), grossPesewa: pesewas(7300), paidAllStatesPesewa: pesewas(0), orderNo: 'LW-260928-004' });
    expect(body).toContain('bag received for you.');
  });

  it('ready and payment messages say exactly what the proposal promises', () => {
    expect(readyMessage('LW-260928-003')).toBe('Lawmann: your laundry is ready for collection. Order LW-260928-003.');
    expect(paymentMessage(pesewas(5000), 'LW-260928-003', pesewas(4300))).toBe(
      'Lawmann: GH¢50 received for LW-260928-003. Balance owing GH¢43.',
    );
  });

  it('every template stays within one SMS segment', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 60 }),
        fc.integer({ min: 1, max: 20000 }),
        fc.integer({ min: 0, max: 100000 }),
        (name, weight, paid) => {
          const bodies = [
            acceptedMessage({ name, weightGrams: grams(weight), grossPesewa: pesewas(9300), paidAllStatesPesewa: pesewas(paid), orderNo: 'LW-260928-003' }),
            readyMessage('LW-260928-003'),
            paymentMessage(pesewas(5000), 'LW-260928-003', pesewas(4300)),
          ];
          for (const body of bodies) expect(body.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('outbox', () => {
  let client: PGlite;
  let db: TestDb;
  let fx: ShopFixture;

  const enqueue = () =>
    enqueueSms(db, { shopId: fx.shopId, orderId: null, kind: 'accepted', toPhone: '0241234567', body: 'Lawmann: test.' });

  beforeAll(async () => {
    db = await freshDb();
    client = db.$client;
  });

  beforeEach(async () => {
    await resetDb(db);
    fx = await seededShop(db, client);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await client.close();
  });

  it('records intent as queued before any send', async () => {
    const id = await enqueue();
    const rows = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.id, id));
    expect(rows[0]?.state).toBe('queued');
  });

  it('without an API key nothing is sent and nothing is faked', async () => {
    vi.stubEnv('ARKESEL_API_KEY', '');
    await enqueue();
    const result = await sendQueued(db);
    expect(result).toEqual({ sent: 0, failed: 0 });
    const rows = await db.select().from(schema.smsMessage);
    expect(rows[0]?.state).toBe('queued');
  });

  it('a gateway success marks the message sent with the provider ref', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'success', data: { id: 'ark-1' } }), { status: 200 })));
    const id = await enqueue();
    expect(await sendQueued(db)).toEqual({ sent: 1, failed: 0 });
    const rows = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.id, id));
    expect(rows[0]?.state).toBe('sent');
    expect(rows[0]?.provider).toBe('arkesel');
    expect(rows[0]?.providerRef).toBe('ark-1');
    expect(rows[0]?.sentAt).not.toBeNull();
  });

  it('a gateway refusal marks the message failed with the reason kept', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'error', message: 'Insufficient balance' }), { status: 200 })));
    const id = await enqueue();
    expect(await sendQueued(db)).toEqual({ sent: 0, failed: 1 });
    const rows = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.id, id));
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.error).toContain('Insufficient balance');
  });

  it('an unreachable gateway marks the message failed, and attemptSend never throws', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const id = await enqueue();
    await attemptSend(db);
    const rows = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.id, id));
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.error).toContain('unreachable');
  });
});
