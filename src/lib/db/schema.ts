/**
 * The one place the table shape lives. Migrations are generated from this file
 * by `npm run db:generate`, so there is no second hand-written copy to drift.
 *
 * The only SQL written by hand is in triggers.sql, for the three things Drizzle
 * cannot express: a view and two triggers. Nothing there redefines a table.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Grams, Pesewas } from '@/lib/money';

/** bigint in the database, number in TypeScript. A pesewa value can never
 *  approach Number.MAX_SAFE_INTEGER, which would be GH¢ 90 trillion. */
const money = (name: string) => bigint(name, { mode: 'number' });

export const locationKind = pgEnum('location_kind', ['store', 'campus']);
export const staffRole = pgEnum('staff_role', ['owner', 'counter', 'collector']);
export const orderStatus = pgEnum('order_status', [
  'received',
  'washing',
  'ready',
  'collected',
  'cancelled',
]);
export const paymentMethod = pgEnum('payment_method', ['cash', 'momo']);
export const paymentState = pgEnum('payment_state', [
  'pending_momo',
  'confirmed',
  'reversed',
]);
export const costCategory = pgEnum('cost_category', [
  'gas',
  'electricity',
  'water',
  'detergent',
  'wages',
  'transport',
  'rent',
  'maintenance',
  'other',
]);
export const smsKind = pgEnum('sms_kind', ['accepted', 'ready', 'payment']);
export const smsState = pgEnum('sms_state', ['queued', 'sent', 'failed']);

export const shop = pgTable('shop', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  momoNumber: text('momo_number'),
});

export const location = pgTable(
  'location',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: locationKind('kind').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [unique('location_shop_name').on(t.shopId, t.name)],
);

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: staffRole('role').notNull(),
    /** scrypt:<salt>:<hash>. Null until the owner sets a PIN; null cannot log in. */
    pinHash: text('pin_hash'),
    /** False means former staff: history stays, the door closes. */
    active: boolean('active').notNull().default(true),
  },
  (t) => [unique('staff_shop_name').on(t.shopId, t.name)],
);

export const student = pgTable(
  'student',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    name: text('name'),
    room: text('room'),
  },
  (t) => [unique('student_shop_phone').on(t.shopId, t.phone)],
);

export const band = pgTable('band', {
  id: uuid('id').primaryKey().defaultRandom(),
  toGrams: integer('to_grams').notNull(),
  price: money('price_pesewa').notNull(),
  active: boolean('active').notNull().default(true),
});

export const orders = pgTable(
  'orders',
  {
    // Client generated so the primary key doubles as the offline idempotency key:
    // a retried sync collides here instead of creating a duplicate order.
    id: uuid('id').primaryKey(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    orderNo: text('order_no').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    /** Which staff member took the bag. Null only for rows older than the column. */
    recordedBy: uuid('recorded_by').references(() => staff.id),
    status: orderStatus('status').notNull().default('received'),

    // Mandatory on every order, including piece priced ones. The cost basis is
    // per kilo, so an order with no weight has unknown margin and must not exist.
    weightGrams: integer('weight_grams').notNull(),

    method: text('method').notNull(),
    gross: money('gross_pesewa').notNull(),

    // Act 1151 split, stored rather than recomputed on read, so a later rate
    // change cannot retroactively alter a filed return.
    base: money('base_pesewa').notNull(),
    vat: money('vat_pesewa').notNull(),
    nhil: money('nhil_pesewa').notNull(),
    getfund: money('getfund_pesewa').notNull(),

    promisedAt: timestamp('promised_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    collectedAt: timestamp('collected_at', { withTimezone: true }),
    dormancyFlaggedAt: timestamp('dormancy_flagged_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('orders_shop_no').on(t.shopId, t.orderNo),
    index('orders_status').on(t.shopId, t.status),
    // The arrears query runs on every dashboard load and grows without bound.
    index('orders_open').on(t.shopId, t.createdAt),
    index('orders_student').on(t.studentId, t.createdAt),
  ],
);

export const payment = pgTable(
  'payment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    amount: money('amount_pesewa').notNull(),
    method: paymentMethod('method').notNull(),
    /** Who took the money. Null only for rows older than the column. */
    recordedBy: uuid('recorded_by').references(() => staff.id),
    // Claimed is not confirmed. On a personal MoMo number pending_momo is the
    // normal state, and the owner's dashboard must never mix the two.
    state: paymentState('state').notNull().default('confirmed'),
    // Transaction id from the MTN confirmation SMS, photographed at the counter.
    // This is the whole substitute for a payment gateway.
    gatewayRef: text('gateway_ref'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('payment_order').on(t.orderId),
    index('payment_paid_at').on(t.paidAt),
    // One MoMo transaction settles one order, never two. A replayed offline sync
    // collides here, which is the desired outcome: treat it as success.
    uniqueIndex('payment_gateway_ref').on(t.gatewayRef),
  ],
);

export const operatingCost = pgTable(
  'operating_cost',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    category: costCategory('category').notNull(),
    label: text('label'),
    amount: money('amount_pesewa').notNull(),
    incurredOn: date('incurred_on').notNull(),
  },
  (t) => [index('operating_cost_period').on(t.shopId, t.incurredOn)],
);

export const shift = pgTable('shift', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  float: money('float_pesewa').notNull(),
  counted: money('counted_pesewa'),
  momoAtOpen: money('momo_at_open_pesewa'),
  momoAtClose: money('momo_at_close_pesewa'),
});

/**
 * The transactional outbox. A message is written queued before any send is
 * attempted, so intent can never be lost to a dropped network. Without
 * ARKESEL_API_KEY messages stay queued and are shown, never faked as sent.
 */
export const smsMessage = pgTable(
  'sms_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    kind: smsKind('kind').notNull(),
    toPhone: text('to_phone').notNull(),
    body: text('body').notNull(),
    state: smsState('state').notNull().default('queued'),
    provider: text('provider'),
    providerRef: text('provider_ref'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sms_message_state').on(t.state, t.createdAt)],
);

/**
 * Status moves with the mover's name. ready_at answers when; this answers who,
 * which matters the day a student receives a "ready" message prematurely.
 */
export const orderEvent = pgTable(
  'order_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatus('from_status').notNull(),
    toStatus: orderStatus('to_status').notNull(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_event_order').on(t.orderId, t.at)],
);

/** Column names this file expects, asserted against the live database at boot. */
export const EXPECTED_COLUMNS = {
  orders: ['weight_grams', 'gross_pesewa', 'base_pesewa', 'vat_pesewa', 'nhil_pesewa', 'getfund_pesewa', 'recorded_by'],
  payment: ['amount_pesewa', 'gateway_ref', 'state', 'recorded_by'],
  staff: ['pin_hash', 'active'],
  sms_message: ['kind', 'state', 'to_phone', 'body', 'sent_at'],
  order_event: ['from_status', 'to_status', 'staff_id', 'at'],
} as const satisfies Record<string, readonly string[]>;

export const moneyColumn = sql`bigint`;
export type OrderRow = typeof orders.$inferSelect;
export type OrderMoney = { gross: Pesewas; weight: Grams };
