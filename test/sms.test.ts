import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { grams, pesewas } from '@/lib/money';
import {
  SMS_SEGMENT_LIMIT,
  acceptedMessage,
  correctedMessage,
  paymentMessage,
  readyMessage,
} from '@/lib/sms/templates';
import { RETRY_AFTER_MS, enqueueSms, sendQueued, attemptSend } from '@/lib/sms/outbox';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

describe('templates', () => {
  it('the accepted message carries weight, price, balance and order number', () => {
    expect(
      acceptedMessage({ name: 'Ama', weightGrams: grams(3500), grossPesewa: pesewas(9300), paidAllStatesPesewa: pesewas(5000), orderNo: 'LW-260928-003' }),
    ).toBe('LAWMANN: bag received for Ama. 3.5kg, GH¢93. Balance owing GH¢43. Order LW-260928-003.');
  });

  it('an unnamed student still gets a readable message', () => {
    const body = acceptedMessage({ name: null, weightGrams: grams(2000), grossPesewa: pesewas(7300), paidAllStatesPesewa: pesewas(0), orderNo: 'LW-260928-004' });
    expect(body).toContain('bag received for you.');
  });

  it('the payment message says exactly what the proposal promises', () => {
    expect(paymentMessage(pesewas(5000), 'LW-260928-003', pesewas(4300))).toBe(
      'LAWMANN: GH¢50 received for LW-260928-003. Balance owing GH¢43.',
    );
  });

  it('the ready message names the items, how many, and the price', () => {
    expect(
      readyMessage('LW-261014-001', { method: 'band', weightGrams: grams(3500), items: [] }, pesewas(7800)),
    ).toBe('LAWMANN: your laundry is ready for delivery. 1 bag, 3.5kg. GH¢78. Order LW-261014-001.');
    expect(
      readyMessage(
        'LW-261014-002',
        { method: 'piece', weightGrams: grams(3500), items: [{ name: 'Shirt', qty: 2 }, { name: 'Trouser', qty: 1 }] },
        pesewas(2400),
      ),
    ).toBe('LAWMANN: your laundry is ready for delivery. 3 items: 2 shirts, 1 trouser. GH¢24. Order LW-261014-002.');
    expect(
      readyMessage(
        'LW-261014-003',
        { method: 'piece', weightGrams: grams(3500), items: [{ name: 'Bedsheet', qty: 1 }] },
        pesewas(2000),
      ),
    ).toBe('LAWMANN: your laundry is ready for delivery. 1 item: 1 bedsheet. GH¢20. Order LW-261014-003.');
  });

  it('a long item list is truncated, never a second segment', () => {
    const items = Array.from({ length: 30 }, () => ({ name: 'Bedsheet', qty: 1 }));
    const body = readyMessage('LW-261014-004', { method: 'piece', weightGrams: grams(3500), items }, pesewas(60000));
    expect(body.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    expect(body).toContain('ready for delivery');
    expect(body).toContain('Order LW-261014-004.');
  });

  it('a corrected message names the order, the new figure, and the balance', () => {
    expect(correctedMessage('LW-261009-014', '2.9kg', pesewas(7300), pesewas(0))).toBe(
      'LAWMANN: order LW-261009-014 corrected to 2.9kg, GH¢73. Paid in full.',
    );
    expect(correctedMessage('LW-261009-014', null, pesewas(7300), pesewas(2800))).toBe(
      'LAWMANN: order LW-261009-014 corrected to GH¢73. Balance owing GH¢28.',
    );
    expect(correctedMessage('LW-261009-014', '2.9kg', pesewas(7300), pesewas(-500))).toBe(
      'LAWMANN: order LW-261009-014 corrected to 2.9kg, GH¢73. Refund due GH¢5.',
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
            readyMessage('LW-260928-003', { method: 'band', weightGrams: grams(3500), items: [] }, pesewas(7800)),
            readyMessage(
              'LW-260928-003',
              { method: 'piece', weightGrams: grams(3500), items: [{ name: 'Bedsheet', qty: 9 }, { name: '2-piece suit', qty: 3 }] },
              pesewas(27000),
            ),
            paymentMessage(pesewas(5000), 'LW-260928-003', pesewas(4300)),
            correctedMessage('LW-260928-003', '2.9kg', pesewas(7300), pesewas(4300)),
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
    enqueueSms(db, { shopId: fx.shopId, orderId: null, kind: 'accepted', toPhone: '0241234567', body: 'LAWMANN: test.' });

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

/**
 * A refusal is not the end of a message. These prove the two halves of that:
 * a fresh failure waits its turn rather than hammering a gateway that just
 * said no, and an aged one is picked up again, with its reason left behind.
 */

describe('outbox retries', () => {
  let client: PGlite;
  let db: TestDb;
  let fx: ShopFixture;

  /** A row already sitting in the outbox, in a given state and at a given age. */
  const seeded = async (state: 'queued' | 'failed', minutesAgo: number, error: string | null = null) => {
    const rows = await db
      .insert(schema.smsMessage)
      .values({
        shopId: fx.shopId,
        orderId: null,
        kind: 'ready',
        toPhone: '0241234567',
        body: 'LAWMANN: your laundry is ready for delivery. Order LW-261014-009.',
        state,
        error,
        createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      })
      .returning();
    return rows[0]!;
  };

  const gatewayOk = () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'success', data: { id: 'ark-retry' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

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

  it('a fresh failure waits its turn instead of hammering the gateway', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    const fetchMock = gatewayOk();
    await seeded('failed', 1, 'Insufficient balance');

    expect(await sendQueued(db)).toEqual({ sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    const rows = await db.select().from(schema.smsMessage);
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.error).toBe('Insufficient balance');
  });

  it('an aged failure is sent again, and its reason is left behind', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    gatewayOk();
    const row = await seeded('failed', RETRY_AFTER_MS / 60000 + 1, 'Insufficient balance');

    expect(await sendQueued(db)).toEqual({ sent: 1, failed: 0 });
    const rows = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.id, row.id));
    expect(rows[0]?.state).toBe('sent');
    expect(rows[0]?.error).toBeNull();
    expect(rows[0]?.providerRef).toBe('ark-retry');
    expect(rows[0]?.sentAt).not.toBeNull();
  });

  it('an aged failure refused a second time keeps its reason and stays owed', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'error', message: 'Still insufficient balance' }), { status: 200 })),
    );
    const row = await seeded('failed', 10, 'Insufficient balance');

    expect(await sendQueued(db)).toEqual({ sent: 0, failed: 1 });
    const rows = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.id, row.id));
    expect(rows[0]?.state).toBe('failed');
    expect(rows[0]?.error).toContain('Still insufficient balance');
  });

  it('a waiting message is sent at once, unaffected by the retry window', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'test-key');
    gatewayOk();
    await seeded('queued', 0);

    expect(await sendQueued(db)).toEqual({ sent: 1, failed: 0 });
  });
});
