# Lawmann order corrections implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a recorded order in place (weight or total, student, pickup point, ready date) with an audit row per change, an amended SMS when the money moved, and a refund-due flag when the corrected price leaves the student overpaid.

**Architecture:** One new lib file `src/lib/corrections.ts` owns the whole operation behind a single `correctOrder(db, orderId, input, session)`, db-first like every other lib here. It loads the order, refuses collected and cancelled ones, re-prices through the shared tariff rule and the shared tax split, diffs the intended record against the stored one, and writes the order update plus one `order_correction` row per changed field inside one transaction. The action layer is a thin `'use server'` wrapper with a zod schema; the order detail page gains a "Correct this order" section in the same visual pattern as the existing Danger zone, and the History section merges status moves with corrections.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, TypeScript, Drizzle ORM over PGlite/Postgres, zod, vitest.

**Spec:** `docs/specs/2026-10-09-order-corrections-design.md` (approved 9 October 2026).

**Spec deviation:** the spec lists `src/lib/orders.ts` for "getOrderDetail returns corrections". This plan reads corrections through a dedicated `listCorrections(db, orderId)` in `src/lib/corrections.ts` instead, and the order page calls it next to `getOrderDetail`. The page merges both trails exactly as the spec describes; keeping the read in the corrections module leaves `orders.ts` owning intake, not repair.

## Global Constraints

Every task implicitly includes all of these:

- Money laws stay exactly as they are. The stored split is recomputed through `splitTaxInclusive` on every correction, so `orders_tax_foots` holds by construction; band prices come from `priceAgainstBands` (the gap rule), never an inline lookup.
- Lib functions take the database first and stay pure of Next.js; actions stay thin. The database is the final judge: known-law violations come back as words through `translateDbError`, anything else throws.
- SMS bodies stay within `SMS_SEGMENT_LIMIT` (160 chars). An extra segment costs the owner money, so length is a design constraint, not a suggestion.
- No float touches money or weight. Pesewas and grams are integers, enforced at the boundary by `assertPesewas`/`assertGrams` conventions and the schema's bigint/integer columns.
- Ops skin unchanged: white and stone neutrals plus the teal accent, `min-h-12` touch targets, `Field`/`TextInput`/`SelectInput` primitives, no new design patterns. The correct form mirrors the existing "Danger zone" `<details>` block.
- Migrations are generated from `src/lib/db/schema.ts` with `npm run db:generate`, never hand-written. Only `triggers.sql` is hand-written, and this feature adds nothing to it.
- Verification before each commit: `npm run typecheck` and the relevant test files must pass. `npm run build` before the final commit.

## File Structure

- `src/lib/db/schema.ts` (modify): add the `correction_field` enum and the `order_correction` table; add `corrected` to `sms_kind`; extend `EXPECTED_COLUMNS`.
- `drizzle/0003_*.sql` (generate): the migration for the above.
- `src/lib/db/index.ts` (modify): export `Writable`, the write surface both the singleton and a transaction expose.
- `src/lib/sms/outbox.ts` (modify): `SmsKind` gains `corrected`; `enqueueSms` takes `Writable` so it can run inside the correction's transaction.
- `src/lib/orders.ts` (modify): export `upsertStudent`, widened to `Writable`, so corrections resolve the right student inside their transaction.
- `src/lib/corrections.ts` (create): `canCorrect`, `CorrectionField`, `CorrectionInput`, `CorrectionResult`, `correctOrder`, `listCorrections`, `correctionLabel`.
- `src/lib/validation.ts` (modify): `correctionSchema`.
- `src/app/actions/corrections.ts` (create): the thin action.
- `src/lib/sms/templates.ts` (modify): `correctedMessage`.
- `src/lib/activity.ts` (modify): a correction branch in the feed UNION, one line per batch.
- `src/app/(app)/app/orders/[id]/page.tsx` (modify): the correct section, merged history, refund-due line.
- `src/components/order-detail-actions.tsx` (modify): `CorrectionForm`.
- `src/app/(app)/app/activity/page.tsx` (modify): filter entry and tone for corrections.
- `test/corrections.test.ts` (create): the whole operation against real Postgres.
- `test/sms.test.ts` (modify): the template and its segment guard.
- `test/validation.test.ts` (modify): the schema.

---

### Task 1: Schema, enums, and the Writable type

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/sms/outbox.ts`
- Modify: `src/lib/orders.ts`
- Generate: `drizzle/0003_*.sql` via `npm run db:generate`

**Interfaces:**
- Consumes: nothing new.
- Produces: `schema.orderCorrection` and `schema.correctionField` (later tasks insert and select them), `Writable` from `@/lib/db` (the parameter type of `enqueueSms` and `upsertStudent`, satisfied by both the singleton and a transaction handle), and `upsertStudent` exported from `@/lib/orders`.

- [ ] **Step 1: Add the enum, the table, and the SMS kind to `schema.ts`**

In `src/lib/db/schema.ts`, change the `sms_kind` enum to:

```ts
export const smsKind = pgEnum('sms_kind', ['accepted', 'ready', 'payment', 'corrected']);
```

Add the new enum and table immediately after the `orderEvent` table and before `EXPECTED_COLUMNS`:

```ts
export const correctionField = pgEnum('correction_field', [
  'weight',
  'price',
  'student',
  'location',
  'promised_date',
]);

/**
 * One row per field a correction moved. A batch id groups the rows of one
 * correction, so the activity feed reads one action as one line. The note
 * rides every row, because an audit line without its reason is half a record.
 */
export const orderCorrection = pgTable(
  'order_correction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    field: correctionField('field').notNull(),
    fromValue: text('from_value').notNull(),
    toValue: text('to_value').notNull(),
    note: text('note').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_correction_order').on(t.orderId, t.at)],
);
```

Extend `EXPECTED_COLUMNS` with:

```ts
  order_correction: ['batch_id', 'field', 'from_value', 'to_value', 'note', 'at'],
```

- [ ] **Step 2: Export `Writable` from `src/lib/db/index.ts`**

Add after the `Db` type alias:

```ts
/**
 * The write surface both the singleton and a transaction handle expose.
 * Helpers that may run inside db.transaction take this: the transaction
 * carries the same query builders, and only $client lives outside it.
 */
export type Writable = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;
```

- [ ] **Step 3: Widen `enqueueSms` in `src/lib/sms/outbox.ts`**

Change the import and the signature:

```ts
import type { Db, Writable } from '@/lib/db';
```

```ts
export type SmsKind = 'accepted' | 'ready' | 'payment' | 'corrected';
```

```ts
export async function enqueueSms(db: Writable, input: EnqueueInput): Promise<string> {
```

Leave `sendQueued(db: Db, ...)` and `attemptSend(db: Db, ...)` as they are: they run outside transactions.

- [ ] **Step 4: Export `upsertStudent` from `src/lib/orders.ts`**

Change the type import to `import type { Db, Writable } from '@/lib/db';`, then change the function declaration:

```ts
/** Exported so a correction can resolve the right student inside its transaction. */
export async function upsertStudent(db: Writable, shopId: string, phone: string, name: string | undefined, room: string | undefined): Promise<typeof schema.student.$inferSelect> {
```

The body is unchanged. It only uses select, update, and insert, which `Writable` covers.

- [ ] **Step 5: Generate the migration**

Run: `npm run db:generate`

Expected: a new `drizzle/0003_*.sql` plus journal and snapshot entries. Inspect the generated SQL and confirm it contains `CREATE TYPE "public"."correction_field"`, `CREATE TABLE "order_correction"`, and `ALTER TYPE "public"."sms_kind" ADD VALUE 'corrected';`. The enum ADD VALUE runs inside `migrate.ts`'s BEGIN/COMMIT wrapper, which PGlite accepts, and the new value is usable in later transactions (verified).

- [ ] **Step 6: Verify the fresh-database boot**

Run: `npx vitest run test/orders.test.ts`

Expected: PASS. `freshDb()` boots an in-memory PGlite through `runBoot`, so this proves the generated migration applies and the `EXPECTED_COLUMNS` assertion holds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/index.ts src/lib/sms/outbox.ts src/lib/orders.ts drizzle/
git commit -m "Corrections: the order_correction table, the corrected SMS kind, and a Writable db type"
```

---

### Task 2: The amended SMS template

**Files:**
- Modify: `src/lib/sms/templates.ts`
- Test: `test/sms.test.ts`

**Interfaces:**
- Consumes: `moneyShort`, `Pesewas` from `@/lib/money`.
- Produces: `correctedMessage(orderNo, weight, grossPesewa, balancePesewa)`, consumed by `correctOrder` in Task 3.

- [ ] **Step 1: Write the failing tests**

In `test/sms.test.ts`, add `correctedMessage` to the import from `@/lib/sms/templates`:

```ts
import {
  SMS_SEGMENT_LIMIT,
  acceptedMessage,
  correctedMessage,
  paymentMessage,
  readyMessage,
} from '@/lib/sms/templates';
```

Add this test inside the `describe('templates')` block, after the "ready and payment messages" test:

```ts
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
```

Add the corrected body to the list inside the "every template stays within one SMS segment" property test:

```ts
            correctedMessage('LW-260928-003', '2.9kg', pesewas(7300), pesewas(4300)),
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/sms.test.ts`

Expected: FAIL with "correctedMessage is not a function".

- [ ] **Step 3: Implement the template**

Append to `src/lib/sms/templates.ts`:

```ts
/**
 * The amended text. The order number leads, because that is the thing the
 * student copied down. The weight is dropped for piece-priced orders, which
 * have no weight price. A negative balance is a refund owed, not a balance.
 */
export function correctedMessage(orderNo: string, weight: string | null, grossPesewa: Pesewas, balancePesewa: Pesewas): string {
  const what = weight ? `corrected to ${weight}, ${moneyShort(grossPesewa)}` : `corrected to ${moneyShort(grossPesewa)}`;
  const balance =
    balancePesewa > 0
      ? `Balance owing ${moneyShort(balancePesewa)}.`
      : balancePesewa < 0
        ? `Refund due ${moneyShort(-balancePesewa)}.`
        : 'Paid in full.';
  return `LAWMANN: order ${orderNo} ${what}. ${balance}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/sms.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms/templates.ts test/sms.test.ts
git commit -m "SMS: the corrected template, one segment, refund owed when overpaid"
```

The messages page (`/app/messages`) needs no change: it renders each message's `body` and its `state` badge, so a corrected message appears there as soon as it is queued, exactly like the other three kinds.

---

### Task 3: The correction operation

**Files:**
- Create: `src/lib/corrections.ts`
- Test: `test/corrections.test.ts`

**Interfaces:**
- Consumes: `Db`, `Writable` from `@/lib/db`; `schema`; `translateDbError`; `splitTaxInclusive`; `priceAgainstBands`; `normalizePhone`; `moneyShort`, `weightLabel`, `Grams`, `Pesewas`; `Session`; `upsertStudent` from `@/lib/orders`; `enqueueSms`; `correctedMessage`.
- Produces: `CorrectionField`, `CorrectionInput`, `CorrectionResult`, `canCorrect(role)`, `correctOrder(db, orderId, input, session)`, `listCorrections(db, orderId)`, `correctionLabel(field)`.

- [ ] **Step 1: Write the test file with its fixture and the first four tests**

Create `test/corrections.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import { BANDS } from '@/lib/pricing';
import { grams, pesewas } from '@/lib/money';
import { intakeSchema } from '@/lib/validation';
import { advanceStatus, createOrder, getOrderDetail } from '@/lib/orders';
import { canCorrect, correctOrder, listCorrections } from '@/lib/corrections';
import { splitTaxInclusive } from '@/lib/tax';
import type { Session } from '@/lib/auth';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The repair flow against real Postgres: a correction re-prices through the
 * shared tariff, re-splits the tax, writes one audit row per changed field,
 * and refuses to touch a bag that has already left.
 */

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

const correct = (orderId: string, overrides: Record<string, unknown> = {}) =>
  correctOrder(
    db,
    orderId,
    {
      method: 'band',
      weightGrams: null,
      totalPesewa: null,
      phone: '0241234567',
      locationId: fx.locationId,
      promisedOn: null,
      note: 'scale slipped',
      ...overrides,
    },
    session,
  );

const correctionsOf = async (orderId: string) =>
  (await db.select().from(schema.orderCorrection).where(eq(schema.orderCorrection.orderId, orderId))).map((r) => [
    r.field,
    r.fromValue,
    r.toValue,
  ]);

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
```

Append these describes to the same file:

```ts
describe('canCorrect', () => {
  it('opens the door to owner and counter, closes it to collector', () => {
    expect(canCorrect('owner')).toBe(true);
    expect(canCorrect('counter')).toBe(true);
    expect(canCorrect('collector')).toBe(false);
  });
});

describe('correctOrder, band orders', () => {
  it('re-prices a gap correction through the tariff and re-splits the tax', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.order.weightGrams).toBe(2900);
    expect(detail?.order.gross).toBe(7300);
    const split = splitTaxInclusive(7300);
    expect(detail?.order.base).toBe(split.base);
    expect(detail?.order.vat).toBe(split.vat);
    expect(detail?.order.nhil).toBe(split.nhil);
    expect(detail?.order.getfund).toBe(split.getfund);
    expect(detail !== null && detail.order.base + detail.order.vat + detail.order.nhil + detail.order.getfund).toBe(7300);
  });

  it('writes one audit row per changed field, with the note on every row', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Corrected · 2.9kg, GH¢73');
    expect(await correctionsOf(created.orderId)).toEqual([
      ['weight', '3.5kg', '2.9kg'],
      ['price', 'GH¢78', 'GH¢73'],
    ]);
    const rows = await db.select().from(schema.orderCorrection);
    expect(rows.every((r) => r.note === 'scale slipped' && r.staffId === fx.staffId)).toBe(true);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
  });

  it('refuses a correction that changes nothing', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(3500) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('nothing is different');
  });

  it('refuses a collected order and a cancelled one, in words', async () => {
    const collected = await createOrder(db, intake(), session);
    const cancelled = await createOrder(db, intake(), session);
    if (!collected.ok || !cancelled.ok) throw new Error('setup failed');
    await advanceStatus(db, collected.orderId, 'washing', session);
    await advanceStatus(db, collected.orderId, 'ready', session);
    await advanceStatus(db, collected.orderId, 'collected', session);
    await advanceStatus(db, cancelled.orderId, 'cancelled', session);

    const a = await correct(collected.orderId, { weightGrams: grams(2900) });
    const b = await correct(cancelled.orderId, { weightGrams: grams(2900) });

    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.error).toContain('collected');
    expect(b.error).toContain('cancelled');
    expect(await db.select().from(schema.orderCorrection)).toHaveLength(0);
  });
});

describe('correctOrder, piece orders', () => {
  it('corrects the total, never the weight', async () => {
    const created = await createOrder(db, intake({ method: 'piece', pieces: [{ code: 'SHIRT', qty: 2 }] }), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { method: 'piece', totalPesewa: pesewas(1800) });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.order.gross).toBe(1800);
    expect(detail?.order.weightGrams).toBe(3500);
    expect(await correctionsOf(created.orderId)).toEqual([['price', 'GH¢16', 'GH¢18']]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/corrections.test.ts`

Expected: FAIL, the module `@/lib/corrections` does not exist.

- [ ] **Step 3: Create `src/lib/corrections.ts` with its imports, types, and helpers**

```ts
import { and, asc, eq, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import { translateDbError } from '@/lib/errors';
import { splitTaxInclusive } from '@/lib/tax';
import { priceAgainstBands } from '@/lib/pricing';
import { normalizePhone } from '@/lib/validation';
import { moneyShort, weightLabel, type Grams, type Pesewas } from '@/lib/money';
import { correctedMessage } from '@/lib/sms/templates';
import { attemptSend, enqueueSms } from '@/lib/sms/outbox';
import { upsertStudent } from '@/lib/orders';
import type { Session } from '@/lib/auth';

/**
 * The repair flow. A mis-keyed weight, a wrong student attached by a typo'd
 * phone, a mistyped total: all fixed in place, with the mistake still
 * visible. The bag record is corrected atomically, one audit row per changed
 * field, and the student hears about it when the money moved.
 *
 * Three rules hold. The gross is always recomputed here, never trusted from
 * the form. The diff is written, not inferred later: one row per field with
 * the human form of the old and new value, and the reason on every row. And
 * a collected or cancelled order keeps its figures, because the money has
 * already moved.
 */

export type CorrectionField = 'weight' | 'price' | 'student' | 'location' | 'promised_date';

export interface CorrectionInput {
  readonly method: 'band' | 'piece';
  readonly weightGrams: Grams | null;
  readonly totalPesewa: Pesewas | null;
  readonly phone: string;
  readonly locationId: string;
  readonly promisedOn: string | null;
  readonly note: string;
}

export type CorrectionResult =
  | { ok: true; orderId: string; orderNo: string; changes: CorrectionField[]; summary: string; smsQueued: boolean }
  | { ok: false; error: string };

const OPEN: ReadonlySet<string> = new Set(['received', 'washing', 'ready']);

/** Counter and owner repair; collectors take bags, they do not edit them. */
export function canCorrect(role: Session['role']): boolean {
  return role === 'owner' || role === 'counter';
}

function failure(error: string): CorrectionResult {
  return { ok: false, error };
}

function promisedTimestamp(day: string | null): Date | null {
  return day ? new Date(`${day}T12:00:00Z`) : null;
}

function dayOf(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : 'none';
}

/** "Corrected · 2.9kg, GH¢73 · 2 details". Reads as the counter's receipt. */
function summaryOf(changes: ReadonlyArray<{ field: CorrectionField; to: string }>): string {
  const money = changes.filter((c) => c.field === 'weight' || c.field === 'price').map((c) => c.to);
  const rest = changes.length - money.length;
  const bits = ['Corrected'];
  if (money.length > 0) bits.push(money.join(', '));
  if (rest > 0) bits.push(`${rest} other ${rest === 1 ? 'detail' : 'details'}`);
  return bits.join(' · ');
}
```

- [ ] **Step 4: Add `correctOrder`, `listCorrections`, and `correctionLabel` to the same file**

```ts
export async function correctOrder(
  db: Db,
  orderId: string,
  input: CorrectionInput,
  session: Session,
): Promise<CorrectionResult> {
  const rows = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.shopId, session.shopId)));
  const order = rows[0];
  if (!order) return failure('Order not found.');
  if (!OPEN.has(order.status)) {
    return failure(`A ${order.status} order keeps its figures. Only an open bag can be corrected.`);
  }

  const phone = normalizePhone(input.phone);
  if (!phone) return failure('Enter a Ghana phone number, like 0241234567.');

  const [currentStudent] = await db.select().from(schema.student).where(eq(schema.student.id, order.studentId));
  if (!currentStudent) return failure('The student on this order is missing.');

  const [currentLocation] = await db.select().from(schema.location).where(eq(schema.location.id, order.locationId));

  const targetLocations = await db
    .select()
    .from(schema.location)
    .where(and(eq(schema.location.id, input.locationId), eq(schema.location.shopId, session.shopId)));
  const location = targetLocations[0];
  if (!location) return failure('Choose where the bag was taken.');

  // The intended record, priced exactly as intake prices it.
  let weightGrams = order.weightGrams as Grams;
  let gross = order.gross as Pesewas;
  if (order.method === 'band') {
    if (input.weightGrams === null) return failure('That order prices by weight, so give the corrected weight.');
    if (input.totalPesewa !== null) return failure('That order prices by weight, so clear the price field.');
    const bandRows = await db.select().from(schema.band).where(eq(schema.band.active, true)).orderBy(asc(schema.band.toGrams));
    const priced = priceAgainstBands(bandRows, input.weightGrams);
    if ('missing' in priced) return failure(priced.missing);
    weightGrams = input.weightGrams;
    gross = priced.price;
  } else {
    if (input.totalPesewa === null) return failure('That order prices by the item, so give the corrected total.');
    if (input.weightGrams !== null) return failure('That order prices by the item, so clear the weight field.');
    if (input.totalPesewa <= 0) return failure('The corrected total must be more than zero.');
    gross = input.totalPesewa;
  }

  const promisedAt = promisedTimestamp(input.promisedOn);
  const sameDay = (a: Date | null, b: Date | null): boolean =>
    a === null || b === null ? a === b : a.getTime() === b.getTime();

  // The diff, in a fixed order, one row per field.
  const changes: Array<{ field: CorrectionField; from: string; to: string }> = [];
  if (weightGrams !== order.weightGrams) {
    changes.push({ field: 'weight', from: weightLabel(order.weightGrams), to: weightLabel(weightGrams) });
  }
  if (gross !== order.gross) {
    changes.push({ field: 'price', from: moneyShort(order.gross), to: moneyShort(gross) });
  }
  if (phone !== currentStudent.phone) {
    changes.push({ field: 'student', from: currentStudent.phone, to: phone });
  }
  if (location.id !== order.locationId) {
    changes.push({ field: 'location', from: currentLocation?.name ?? 'unknown', to: location.name });
  }
  if (!sameDay(promisedAt, order.promisedAt)) {
    changes.push({ field: 'promised_date', from: dayOf(order.promisedAt), to: dayOf(promisedAt) });
  }
  if (changes.length === 0) {
    return failure('Nothing is different on this order. Check the figures before saving.');
  }

  const note = input.note.trim();
  const split = splitTaxInclusive(gross);
  const batchId = crypto.randomUUID();
  const moneyMoved = changes.some((c) => c.field === 'weight' || c.field === 'price');

  try {
    await db.transaction(async (tx) => {
      const student = await upsertStudent(tx, session.shopId, phone, undefined, undefined);

      await tx
        .update(schema.orders)
        .set({
          weightGrams,
          gross,
          base: split.base,
          vat: split.vat,
          nhil: split.nhil,
          getfund: split.getfund,
          studentId: student.id,
          locationId: location.id,
          promisedAt,
        })
        .where(eq(schema.orders.id, orderId));

      // The typo'd student row goes when nothing else points at it.
      if (student.id !== order.studentId) {
        const [leftover] = await tx
          .select({ n: sql<string | number>`count(*)` })
          .from(schema.orders)
          .where(eq(schema.orders.studentId, order.studentId));
        if (Number(leftover?.n ?? 0) === 0) {
          await tx.delete(schema.student).where(eq(schema.student.id, order.studentId));
        }
      }

      for (const change of changes) {
        await tx.insert(schema.orderCorrection).values({
          batchId,
          orderId,
          staffId: session.staffId,
          field: change.field,
          fromValue: change.from,
          toValue: change.to,
          note,
        });
      }

      if (moneyMoved) {
        const [paidRow] = await tx
          .select({ total: sql<string | number>`COALESCE(SUM(amount_pesewa) FILTER (WHERE state <> 'reversed'), 0)` })
          .from(schema.payment)
          .where(eq(schema.payment.orderId, orderId));
        const paid = Number(paidRow?.total ?? 0);
        await enqueueSms(tx, {
          shopId: session.shopId,
          orderId,
          kind: 'corrected',
          toPhone: phone,
          body: correctedMessage(
            order.orderNo,
            order.method === 'band' ? weightLabel(weightGrams) : null,
            gross,
            gross - paid,
          ),
        });
      }
    });
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }

  await attemptSend(db);

  return {
    ok: true,
    orderId,
    orderNo: order.orderNo,
    changes: changes.map((c) => c.field),
    summary: summaryOf(changes),
    smsQueued: moneyMoved,
  };
}

export interface CorrectionRow {
  field: CorrectionField;
  fromValue: string;
  toValue: string;
  staffName: string;
  note: string;
  at: Date;
}

/** The order's corrections, oldest first, for the merged history on the order page. */
export async function listCorrections(db: Db, orderId: string): Promise<CorrectionRow[]> {
  const rows = await db
    .select({ correction: schema.orderCorrection, staffName: schema.staff.name })
    .from(schema.orderCorrection)
    .innerJoin(schema.staff, eq(schema.orderCorrection.staffId, schema.staff.id))
    .where(eq(schema.orderCorrection.orderId, orderId))
    .orderBy(asc(schema.orderCorrection.at));
  return rows.map((r) => ({
    field: r.correction.field,
    fromValue: r.correction.fromValue,
    toValue: r.correction.toValue,
    staffName: r.staffName,
    note: r.correction.note,
    at: r.correction.at,
  }));
}

const FIELD_LABELS: Record<CorrectionField, string> = {
  weight: 'weight',
  price: 'price',
  student: 'student',
  location: 'pickup point',
  promised_date: 'ready date',
};

export function correctionLabel(field: CorrectionField): string {
  return FIELD_LABELS[field];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/corrections.test.ts`

Expected: PASS. `count(*)` typed as `sql<string | number>` follows the same pattern `activity.ts` already uses.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/corrections.ts test/corrections.test.ts
git commit -m "Corrections: correctOrder re-prices, re-splits, and audits one row per field"
```

---

### Task 4: The correction schema and the action layer

**Files:**
- Modify: `src/lib/validation.ts`
- Create: `src/app/actions/corrections.ts`
- Test: `test/validation.test.ts`

**Interfaces:**
- Consumes: `phoneField`, `normalizePhone` conventions from `src/lib/validation.ts`; `canCorrect` and `correctOrder` from Task 3.
- Produces: `correctionSchema` and its inferred input type; `correctOrderAction(_prev, formData)` returning `CorrectionState` (`{ ok, error?, summary? }`), consumed by the `CorrectionForm` in Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `test/validation.test.ts`:

```ts
describe('correctionSchema', () => {
  const base = {
    orderId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    method: 'band',
    weightKg: '2.9',
    phone: '0241234567',
    locationId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    note: 'scale slipped',
  };

  it('accepts a band correction and keeps the weight as typed', () => {
    const parsed = correctionSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.weightKg).toBe('2.9');
    expect(parsed.data.promisedOn).toBe('');
  });

  it('accepts a piece correction with a total and no weight', () => {
    const parsed = correctionSchema.safeParse({ ...base, method: 'piece', weightKg: undefined, totalGhs: '16' });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.totalGhs).toBe('16');
  });

  it('treats an empty promised date as no date', () => {
    const parsed = correctionSchema.safeParse({ ...base, promisedOn: '' });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.promisedOn).toBe('');
  });

  it('refuses a note too short to explain anything', () => {
    expect(correctionSchema.safeParse({ ...base, note: 'x' }).success).toBe(false);
  });

  it('refuses a bad phone and a bad promised date', () => {
    expect(correctionSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...base, promisedOn: '16/10/2026' }).success).toBe(false);
  });
});
```

Add `correctionSchema` to the import from `@/lib/validation` in that file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/validation.test.ts`

Expected: FAIL, `correctionSchema` is not exported.

- [ ] **Step 3: Add the schema to `src/lib/validation.ts`**

Append after `paymentSchema`:

```ts
/**
 * The correction form's shape. Weight or total depending on how the order
 * prices, which is the order's own fact, so the mismatch is refused in the
 * lib with the order's own words rather than duplicated here.
 */
export const correctionSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(['band', 'piece']),
  weightKg: z.union([z.string(), z.number()]).optional(),
  totalGhs: z.union([z.string(), z.number()]).optional(),
  phone: phoneField,
  locationId: z.string().uuid('Choose where the bag was taken.'),
  promisedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the ready date.').optional().or(z.literal('')),
  note: z.string().trim().min(3, 'Say why the record is changing.').max(120),
});
export type CorrectionInputForm = z.infer<typeof correctionSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/validation.test.ts`

Expected: PASS.

- [ ] **Step 5: Create the action**

Create `src/app/actions/corrections.ts`:

```ts
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
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`

Expected: no output. The action's guard mirrors `confirmMomoAction`, which is the existing pattern for the counter-or-owner split. The repo tests lib functions, not action glue, so the collector refusal is covered by `canCorrect`'s unit test in Task 3 and this one-line guard; `test/actions` do not exist and this plan adds none.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation.ts src/app/actions/corrections.ts test/validation.test.ts
git commit -m "Corrections: the correction schema and the thin action that guards the roles"
```

---

### Task 5: The order page, the merged history, and the correct form

**Files:**
- Modify: `src/app/(app)/app/orders/[id]/page.tsx`
- Modify: `src/components/order-detail-actions.tsx`

**Interfaces:**
- Consumes: `canCorrect`, `listCorrections`, `correctionLabel`, `CorrectionRow` from Task 3; `correctOrderAction`, `CorrectionState` from Task 4; `priceAgainstBands` and `kgToGrams` for the live quote.
- Produces: `CorrectionForm`, the client form the order page renders inside the "Correct this order" section.

- [ ] **Step 1: Extend the page's queries and gating**

In `src/app/(app)/app/orders/[id]/page.tsx`, extend these imports:

```ts
import { and, asc, eq } from 'drizzle-orm';   // the existing import gains `and`
import { band, location, smsMessage } from '@/lib/db/schema';   // the existing import gains `band` and `location`
import { canCorrect, correctionLabel, listCorrections } from '@/lib/corrections';
import { CorrectionForm } from '@/components/order-detail-actions';
```

After the existing `const detail = await getOrderDetail(db, id, session);` and the `messages` query, add:

```ts
  const corrections = await listCorrections(db, id);
  const canFix = canCorrect(session.role) && ['received', 'washing', 'ready'].includes(order.status);
  const correctionLists = canFix
    ? {
        locations: await db
          .select({ id: location.id, name: location.name })
          .from(location)
          .where(and(eq(location.shopId, session.shopId), eq(location.active, true)))
          .orderBy(asc(location.name)),
        bands: await db
          .select({ toGrams: band.toGrams, pricePesewa: band.price })
          .from(band)
          .where(eq(band.active, true))
          .orderBy(asc(band.toGrams)),
      }
    : null;
```

- [ ] **Step 2: Merge the history and add the refund-due line**

Replace the `History` section's `<ul>` body so it renders one merged, time-ordered list. Add this just before the `return`:

```ts
  const history = [
    ...detail.events.map((e) => ({ at: e.at, text: `${e.from} → ${e.to} · ${e.staffName}` })),
    ...corrections.map((c) => ({
      at: c.at,
      text: `${correctionLabel(c.field)}: ${c.fromValue} to ${c.toValue} · ${c.staffName}${c.note ? ` · ${c.note}` : ''}`,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
```

Then replace the whole `{detail.events.length > 0 ? (...) : null}` History block with:

```tsx
      {history.length > 0 ? (
        <Section title="History">
          <ul className="space-y-1 text-sm text-stone-600">
            {history.map((h, i) => (
              <li key={`${h.at.getTime()}-${i}`} className="flex justify-between gap-3">
                <span>{h.text}</span>
                <span className="tabular-nums">{formatDate(h.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
```

In the money section, replace the "Still owing" row so a negative balance reads as a refund:

```tsx
          <div className="flex justify-between gap-3 border-t border-stone-200 pt-1 text-base">
            <dt className="font-semibold">Still owing</dt>
            <dd
              className={`font-bold tabular-nums ${
                detail.balancePesewa > 0 ? 'text-red-700' : detail.balancePesewa < 0 ? 'text-amber-700' : 'text-green-700'
              }`}
            >
              {detail.balancePesewa > 0 ? (
                <Money pesewas={detail.balancePesewa} />
              ) : detail.balancePesewa < 0 ? (
                `Refund due ${moneyShort(-detail.balancePesewa)}`
              ) : (
                'Settled'
              )}
            </dd>
          </div>
```

- [ ] **Step 3: Add the "Correct this order" section**

Place it immediately after the "Move this bag" section and before the History section:

```tsx
      {canFix && correctionLists ? (
        <details className="rounded-lg border border-stone-200 bg-white">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-stone-700">
            Correct this order
          </summary>
          <div className="border-t border-stone-100 p-4">
            <CorrectionForm
              order={{
                id: order.id,
                orderNo: order.orderNo,
                method: order.method,
                weightGrams: order.weightGrams,
                gross: order.gross,
                promisedOn: order.promisedAt ? order.promisedAt.toISOString().slice(0, 10) : '',
              }}
              studentPhone={student.phone}
              locationId={location.id}
              locations={correctionLists.locations}
              bands={correctionLists.bands}
            />
          </div>
        </details>
      ) : null}
```

The page's existing destructuring already gives `order`, `student`, and `location`.

- [ ] **Step 4: Add the `CorrectionForm` client component**

In `src/components/order-detail-actions.tsx`, extend the React import and add the new imports:

```ts
import { useActionState, useState } from 'react';
```

```ts
import { kgToGrams } from '@/lib/validation';
import { priceAgainstBands } from '@/lib/pricing';
import { correctOrderAction } from '@/app/actions/corrections';
```

`moneyShort`, `Field`, `TextInput`, `SelectInput`, `FormError`, and `PrimaryButton` are already imported in that file. Append:

```tsx
/**
 * The correction form. One form per order, pre-filled with the record as it
 * stands: the weight or the total depending on how the order prices, the
 * student phone, the pickup point, the ready date, and the one line that
 * rides every audit row. The live price mirrors intake through the same
 * shared tariff, so nobody saves a correction blind.
 */
export function CorrectionForm({
  order,
  studentPhone,
  locationId,
  locations,
  bands,
}: {
  order: { id: string; orderNo: string; method: string; weightGrams: number; gross: number; promisedOn: string };
  studentPhone: string;
  locationId: string;
  locations: Array<{ id: string; name: string }>;
  bands: Array<{ toGrams: number; pricePesewa: number }>;
}) {
  const [state, action] = useActionState(correctOrderAction, { ok: false });
  const isBand = order.method === 'band';
  const [weightKg, setWeightKg] = useState(isBand ? String(order.weightGrams / 1000) : '');
  const [totalGhs, setTotalGhs] = useState(isBand ? '' : String(order.gross / 100));
  const [phone, setPhone] = useState(studentPhone);
  const [location, setLocation] = useState(locationId);
  const [promisedOn, setPromisedOn] = useState(order.promisedOn);
  const [note, setNote] = useState('');

  const grams = weightKg ? kgToGrams(weightKg) : null;
  const quote = isBand && grams !== null ? priceAgainstBands(bands, grams) : null;
  const bandPrice = quote !== null && 'price' in quote ? quote.price : null;
  const overweight = quote !== null && 'missing' in quote;
  const band = grams !== null ? bands.find((b) => Math.floor(grams / 1000) * 1000 <= b.toGrams) ?? null : null;
  const gap = band !== null && grams !== null && grams > band.toGrams;

  if (state.ok && state.summary) {
    return (
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
        {state.summary}. The order now shows the new figures.
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="method" value={order.method} />

      {isBand ? (
        <Field label="Weight in kilos" htmlFor="correct-weight" hint="From the scale. The tariff re-prices it, the tenth-of-a-kilo rule included.">
          <TextInput
            id="correct-weight"
            name="weightKg"
            inputMode="decimal"
            required
            placeholder="e.g. 2.9"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          {bandPrice !== null ? (
            <p className="mb-1 text-lg text-stone-900">
              <span className="font-bold tabular-nums">{moneyShort(bandPrice)}</span>
              <span className="ml-2 text-sm text-stone-500">
                {band ? (gap ? `${band.toGrams / 1000}kg band + GH¢5` : `up to ${band.toGrams / 1000}kg band`) : ''}
              </span>
            </p>
          ) : null}
          {overweight && quote !== null && 'missing' in quote ? (
            <p role="alert" className="mb-1 text-sm font-medium text-red-700">
              {quote.missing}
            </p>
          ) : null}
        </Field>
      ) : (
        <Field label="Total in cedis" htmlFor="correct-total" hint="The whole price of the items in this bag.">
          <TextInput
            id="correct-total"
            name="totalGhs"
            inputMode="decimal"
            required
            placeholder="e.g. 16"
            value={totalGhs}
            onChange={(e) => setTotalGhs(e.target.value)}
          />
        </Field>
      )}

      <Field label="Student phone" htmlFor="correct-phone" hint="The phone identifies the student. A wrong number moves the bag to the right one.">
        <TextInput id="correct-phone" name="phone" inputMode="tel" required placeholder="0241234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>

      <Field label="Taken at" htmlFor="correct-location">
        <SelectInput id="correct-location" name="locationId" required value={location} onChange={(e) => setLocation(e.target.value)}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field label="Ready date (optional)" htmlFor="correct-promised">
        <TextInput id="correct-promised" name="promisedOn" type="date" value={promisedOn} onChange={(e) => setPromisedOn(e.target.value)} />
      </Field>

      <Field label="Why is this changing" htmlFor="correct-note" hint="One line. It rides on every correction row in the history.">
        <TextInput id="correct-note" name="note" required maxLength={120} placeholder="scale slipped" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <FormError error={state.ok ? undefined : state.error} />
      <PrimaryButton>Save the correction</PrimaryButton>
    </form>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`, then `npm run build`.

Expected: typecheck silent, build succeeds. The form is a client component posting to a server action; a build failure here means a server/client boundary mistake, which the plan's shape avoids by keeping the page a server component and only the form client.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/app/orders/[id]/page.tsx" src/components/order-detail-actions.tsx
git commit -m "Corrections: the correct form on the order page, merged history, and the refund-due line"
```

---

### Task 6: The activity feed and its filter

**Files:**
- Modify: `src/lib/activity.ts`
- Modify: `src/app/(app)/app/activity/page.tsx`
- Test: `test/corrections.test.ts`

**Interfaces:**
- Consumes: `schema.orderCorrection`; the `ActivityKind` union and `formatItem` in `src/lib/activity.ts`.
- Produces: a `correction` branch in the feed UNION rendering one line per correction batch, with the changed fields aggregated.

- [ ] **Step 1: Write the failing test**

Append to `test/corrections.test.ts`:

```ts
describe('activity feed', () => {
  it('shows one correction line per action, naming every field it moved', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    const result = await correct(created.orderId, { weightGrams: grams(2900) });
    expect(result.ok).toBe(true);

    const feed = await activityFeed(db, fx.shopId, { kind: 'correction' });

    expect(feed).toHaveLength(1);
    expect(feed[0]?.who).toBe('Owner');
    expect(feed[0]?.text).toContain('weight 3.5kg to 2.9kg');
    expect(feed[0]?.text).toContain('price GH¢78 to GH¢73');
  });
});
```

and add the import:

```ts
import { activityFeed } from '@/lib/activity';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/corrections.test.ts`

Expected: FAIL, the feed has no correction entries.

- [ ] **Step 3: Add the correction branch to the feed UNION**

In `src/lib/activity.ts`, extend the kind union:

```ts
export type ActivityKind = 'order' | 'status' | 'payment' | 'cost' | 'shift' | 'sms' | 'correction';
```

Insert this branch into the `UNION` constant, after the `order_event` branch and before the payment branch:

```sql
  UNION ALL
  SELECT c.at, 'correction', s.id, s.name, c.order_id, o.order_no,
    NULL, NULL, NULL, NULL,
    (
      SELECT string_agg(c2.field::text || ' ' || c2.from_value || ' to ' || c2.to_value, ', ' ORDER BY c2.field)
      FROM order_correction c2
      WHERE c2.batch_id = c.batch_id
    )
  FROM order_correction c
  JOIN orders o ON o.id = c.order_id
  JOIN staff s ON s.id = c.staff_id
  WHERE o.shop_id = $1
    AND c.id = (SELECT min(c3.id) FROM order_correction c3 WHERE c3.batch_id = c.batch_id)
```

The `min(c3.id)` guard is what makes one batch render as one line: only the batch's first row is selected, and the correlated `string_agg` gathers every field that batch moved. `ORDER BY c2.field` sorts by the enum's declared order, which is exactly the diff order in `correctOrder`.

Add the case to `formatItem`:

```ts
    case 'correction':
      text = `${who} corrected the fields of ${r.order_no}: ${r.detail ?? ''}`;
      break;
```

- [ ] **Step 4: Add the filter entry and its tone**

In `src/app/(app)/app/activity/page.tsx`, add to `KINDS` after the `sms` entry:

```ts
  { key: 'correction', label: 'Corrections' },
```

and to `KIND_TONE`:

```ts
  correction: 'bg-orange-50 text-orange-900',
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/corrections.test.ts test/reports.test.ts`

Expected: PASS. `test/reports.test.ts` matters here: its activity test asserts the set of kinds for a fixture with no corrections, and it must stay `['cost','order','payment','shift','sms','status']`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/activity.ts "src/app/(app)/app/activity/page.tsx" test/corrections.test.ts
git commit -m "Activity: one line per correction, naming every field it moved"
```

---

### Task 7: The remaining behaviours, then full verification

**Files:**
- Test: `test/corrections.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 6.
- Produces: nothing new. This task completes the spec's test list and proves the whole feature end to end.

- [ ] **Step 1: Write the remaining tests**

Append to `test/corrections.test.ts`:

```ts
describe('correctOrder, the student and the money', () => {
  it('moves the order to the right student and deletes the vacated row', async () => {
    const created = await createOrder(db, intake({ phone: '0249999999', name: 'Ama' }), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2000), phone: '0241234567', note: 'wrong student, phone typo' });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.student.phone).toBe('0241234567');
    const students = await db.select({ phone: schema.student.phone }).from(schema.student);
    expect(students.map((s) => s.phone)).toEqual(['0241234567']);
    expect(await correctionsOf(created.orderId)).toEqual([
      ['weight', '3.5kg', '2kg'],
      ['price', 'GH¢78', 'GH¢73'],
      ['student', '0249999999', '0241234567'],
    ]);
  });

  it('keeps a student row that still has another order', async () => {
    const first = await createOrder(db, intake({ phone: '0249999999' }), session);
    const second = await createOrder(db, intake({ orderId: crypto.randomUUID(), phone: '0249999999' }), session);
    if (!first.ok || !second.ok) throw new Error('setup failed');

    const result = await correct(first.orderId, { weightGrams: grams(2000), phone: '0241234567', note: 'wrong student, phone typo' });

    expect(result.ok).toBe(true);
    const students = await db.select({ phone: schema.student.phone }).from(schema.student);
    expect(students.map((s) => s.phone).sort()).toEqual(['0241234567', '0249999999']);
  });

  it('a downward correction below what was paid leaves a negative balance and names the refund', async () => {
    const created = await createOrder(db, intake({ payment: { method: 'cash', amount: '78' } }), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    const detail = await getOrderDetail(db, created.orderId, session);
    expect(detail?.balancePesewa).toBe(-500);
    const corrected = (await db.select().from(schema.smsMessage)).filter((m) => m.kind === 'corrected');
    expect(corrected).toHaveLength(1);
    expect(corrected[0]?.body).toContain('Refund due GH¢5');
  });

  it('a money correction texts the student once', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { weightGrams: grams(2900) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.smsQueued).toBe(true);
    const corrected = (await db.select().from(schema.smsMessage)).filter((m) => m.kind === 'corrected');
    expect(corrected).toHaveLength(1);
    expect(corrected[0]?.body).toBe('LAWMANN: order ' + created.orderNo + ' corrected to 2.9kg, GH¢73. Paid in full.');
  });

  it('a date-only correction texts nobody', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const result = await correct(created.orderId, { promisedOn: '2026-10-16', note: 'student asked for later' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.smsQueued).toBe(false);
    expect((await db.select().from(schema.smsMessage)).filter((m) => m.kind === 'corrected')).toHaveLength(0);
    expect(await correctionsOf(created.orderId)).toEqual([['promised_date', 'none', '2026-10-16']]);
  });

  it('listCorrections reads the trail back with who and when', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');
    await correct(created.orderId, { weightGrams: grams(2900) });

    const rows = await listCorrections(db, created.orderId);

    expect(rows.map((r) => r.field)).toEqual(['weight', 'price']);
    expect(rows[0]?.staffName).toBe('Owner');
    expect(rows[0]?.note).toBe('scale slipped');
    expect(rows[0]?.at).toBeInstanceOf(Date);
  });

  it('refuses a method mismatch in the order’s own words', async () => {
    const created = await createOrder(db, intake(), session);
    if (!created.ok) throw new Error('setup failed');

    const withPrice = await correct(created.orderId, { totalPesewa: pesewas(5000) });
    expect(withPrice.ok).toBe(false);
    if (withPrice.ok) return;
    expect(withPrice.error).toContain('prices by weight');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run test/corrections.test.ts`

Expected: PASS.

- [ ] **Step 3: Full verification**

Run, in order:

```bash
npm run typecheck
npm test
npm run build
```

Expected: typecheck silent, all test files pass (the suite was 10 files before this feature, so `test/corrections.test.ts` makes 11), build succeeds.

- [ ] **Step 4: Manual checklist against the running app**

Run `npm run dev`, then:

1. Sign in as the owner, open an open order, expand "Correct this order", change the weight from 3.5 to 2.9, and save. The success line reads "Corrected · 2.9kg, GH¢73", the price row shows GH¢73, and History shows the weight and price rows with the note.
2. On the same order, change only the ready date. No SMS is queued, and one `promised_date` row appears.
3. Take a payment of GH¢78 on an order, then correct the weight down to 2.9. The money section reads "Refund due GH¢5".
4. Sign in as a collector. The "Correct this order" section is absent, and the order page still shows the corrected History.
5. Open `/app/activity` and pick "Corrections" from the kind filter. One line names both changed fields.
6. Open the order's receipt. It shows the corrected figures, because it reads the same order row.
7. Open the public `/pricing` page. It is unchanged by this feature.

- [ ] **Step 5: Commit and push**

```bash
git add test/corrections.test.ts
git commit -m "Corrections: the rest of the repair flow, tested end to end"
git push
```

---
