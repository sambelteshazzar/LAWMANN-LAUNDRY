import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import type { Session } from '@/lib/auth';
import { intakeSchema, type ConditionPhotoInputForm } from '@/lib/validation';
import { advanceStatus, createOrder, getOrderDetail } from '@/lib/orders';
import { MAX_PHOTO_CHARS, addConditionPhoto, canPhotograph, listConditionPhotos } from '@/lib/condition';
import { BANDS } from '@/lib/pricing';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The evidence flow against real Postgres: a photograph of an item that
 * arrived already spoiled is written once with its reason and its author, it
 * refuses a bag that has already left, and it keeps a phone-sized image out
 * of an SMS-sized message.
 */

/** A 4x4 red JPEG: the smallest thing that is a real photograph. */
const PHOTO =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAKBueIx4ZKCMgoy0qqC+8P//8Nzc8P//////////////////////////////////////////////////////////2wBDAaq0tPDS8P//////////////////////////////////////////////////////////////////////////////wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBtFFFI0P/Z';

let client: PGlite;
let db: TestDb;
let fx: ShopFixture;
let session: Session;

const intake = (overrides: Record<string, unknown> = {}) =>
  intakeSchema.parse({
    orderId: crypto.randomUUID(),
    locationId: fx.locationId,
    phone: '0241234567',
    name: 'Ama',
    room: 'B12',
    weightKg: '3.5',
    method: 'band',
    payment: null,
    ...overrides,
  });

const shoot = (orderId: string, overrides: Partial<Omit<ConditionPhotoInputForm, 'orderId'>> = {}) =>
  addConditionPhoto(db, orderId, { orderId, note: 'ink on the collar', image: PHOTO, ...overrides }, session);

beforeAll(async () => {
  db = await freshDb();
  client = db.$client;
});

beforeEach(async () => {
  await resetDb(db);
  fx = await seededShop(db, client);
  session = { staffId: fx.staffId, name: 'Owner', role: 'owner', shopId: fx.shopId };
  await db.insert(schema.band).values(BANDS.map((b) => ({ toGrams: b.to, price: b.price, active: true })));
});

afterAll(async () => {
  await client.close();
});

describe('canPhotograph', () => {
  it('hands the camera to every role, the collector included', () => {
    expect(canPhotograph('owner')).toBe(true);
    expect(canPhotograph('counter')).toBe(true);
    expect(canPhotograph('collector')).toBe(true);
  });
});

describe('addConditionPhoto', () => {
  it('writes the photograph with its reason and its author', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await shoot(created.orderId);

    expect(result.ok).toBe(true);
    const rows = await db.select().from(schema.conditionPhoto);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.orderId).toBe(created.orderId);
    expect(rows[0]?.staffId).toBe(fx.staffId);
    expect(rows[0]?.note).toBe('ink on the collar');
    expect(rows[0]?.image).toBe(PHOTO);

    const listed = await listConditionPhotos(db, created.orderId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.staffName).toBe('Owner');
  });

  it('refuses an unknown order, in words', async () => {
    const result = await shoot(crypto.randomUUID());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Order not found');
  });

  it('refuses a bag that has already left, in words', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    await advanceStatus(db, created.orderId, 'washing', session);
    await advanceStatus(db, created.orderId, 'ready', session);
    await advanceStatus(db, created.orderId, 'collected', session);

    const result = await shoot(created.orderId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('left');
    expect(await db.select().from(schema.conditionPhoto)).toHaveLength(0);
  });

  it('refuses an image too large to store, in words', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await shoot(created.orderId, { image: 'x'.repeat(MAX_PHOTO_CHARS + 1) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('too large');
    expect(await db.select().from(schema.conditionPhoto)).toHaveLength(0);
  });

  it('a photograph does not disturb the order or the money', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    await shoot(created.orderId);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.order.gross).toBe(7800);
    expect(detail?.balancePesewa).toBe(7800);
  });
});
