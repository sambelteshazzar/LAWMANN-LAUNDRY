# Plan: condition photos and a ready message that says what is in the bag

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A collector can photograph a spoilt or stained item at intake so the shop has evidence it arrived that way, and the ready SMS tells the student how many items, which items, and the price.

**Architecture:** Two new tables and one rewrite of a message template. `order_item` stores the piece lines at intake so the ready message can name them; `condition_photo` stores one base64 JPEG, downscaled in the browser, with a note and the staff member who took it. `advanceStatus` composes the ready message from the order, its items, and its gross. Photos are written by a thin action, exactly as corrections are.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, TypeScript, Drizzle ORM over PGlite/Postgres, zod, vitest.

**Spec:** `docs/specs/2026-10-14-condition-photos-and-ready-items.md`

## Global Constraints

Every task implicitly includes all of these:

- One SMS segment, 160 characters. A long item list is truncated rather than allowed to cost the owner a second segment.
- No float touches money or weight. Pesewas and grams stay integers.
- Lib functions take the database first and stay pure of Next.js; actions stay thin. Known-law violations come back as words through `translateDbError`; anything else throws.
- Ops skin unchanged: white and stone neutrals plus the teal accent, `min-h-12` touch targets, `Field`/`TextInput` primitives, `Section`, `details` + `summary` for the collapsed form.
- Migrations are generated from `src/lib/db/schema.ts` with `npm run db:generate`, never hand-written.
- Verification before each commit: `npm run typecheck` and the relevant test files. `npm run build` before the final commit.

## File Structure

- `src/lib/db/schema.ts` (modify): add `orderItem` and `conditionPhoto` tables; extend `EXPECTED_COLUMNS`.
- `drizzle/0004_*.sql` (generate): the migration for the above.
- `src/lib/sms/templates.ts` (modify): `readyMessage` takes the order's items, weight, and gross; truncates to one segment.
- `src/lib/orders.ts` (modify): `createOrder` writes `order_item` rows; `advanceStatus` reads them for the ready message.
- `src/lib/condition.ts` (create): `canPhotograph`, `addConditionPhoto`, `listConditionPhotos`, `MAX_PHOTO_CHARS`.
- `src/lib/validation.ts` (modify): `conditionPhotoSchema`.
- `src/app/actions/condition.ts` (create): the thin action.
- `src/components/condition-photos.tsx` (create): the camera form, downscaling in the browser.
- `src/app/(app)/app/orders/[id]/page.tsx` (modify): the items line in the bag section, the Condition section.
- `test/sms.test.ts` (modify): the new ready template and its segment guard.
- `test/orders.test.ts` (modify): the ready message body.
- `test/condition.test.ts` (create): the photo operation against real Postgres.
- `test/db.ts` (modify): truncate the two new tables.
- `scripts/seed.ts` (modify): the ready call's new signature.

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Generate: `drizzle/0004_*.sql` via `npm run db:generate`

**Interfaces:**
- Consumes: nothing new.
- Produces: `schema.orderItem` and `schema.conditionPhoto`, asserted by `EXPECTED_COLUMNS`.

- [ ] **Step 1: Add both tables after `orderCorrection`, before `EXPECTED_COLUMNS`**

```ts
/**
 * The lines of a piece-priced order, written once at intake. The list is a
 * description of what was handed over, never a pricing source: the gross
 * lives on the order and a correction that moves the price moves the
 * message's figure and leaves this list alone. Band orders carry no rows;
 * their description is one bag and its weight.
 */
export const orderItem = pgTable(
  'order_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    qty: integer('qty').notNull(),
    position: smallint('position').notNull(),
  },
  (t) => [index('order_item_order').on(t.orderId, t.position)],
);

/**
 * Evidence that an item arrived already spoilt or stained. One base64 JPEG,
 * downscaled in the browser before it leaves the phone, with the reason and
 * the name of whoever took it. Written once: it is a record, not a gallery.
 * It never reaches the student.
 */
export const conditionPhoto = pgTable(
  'condition_photo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    note: text('note').notNull(),
    image: text('image').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('condition_photo_order').on(t.orderId, t.createdAt)],
);
```

- [ ] **Step 2: Extend `EXPECTED_COLUMNS`**

```ts
  order_item: ['order_id', 'code', 'name', 'qty', 'position'],
  condition_photo: ['order_id', 'staff_id', 'note', 'image', 'created_at'],
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`

Expected: a new `drizzle/0004_*.sql` plus journal and snapshot entries. Inspect it for `CREATE TABLE "order_item"` and `CREATE TABLE "condition_photo"`.

- [ ] **Step 4: Verify the fresh-database boot**

Run: `npx vitest run test/orders.test.ts`

Expected: PASS. `freshDb()` boots in-memory PGlite through `runBoot`, so this proves the migration applies and the `EXPECTED_COLUMNS` assertion holds.

- [ ] **Step 5: Truncate the new tables between tests**

In `test/db.ts`, extend the `resetDb` TRUNCATE list:

```ts
    'TRUNCATE shift, operating_cost, sms_message, order_event, payment, orders, student, staff, location, shop, band, order_item, condition_photo RESTART IDENTITY CASCADE',
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/ test/db.ts
git commit -m "Schema: order_item for the piece lines, condition_photo for the evidence"
```

---

### Task 2: The ready message

**Files:**
- Modify: `src/lib/sms/templates.ts`
- Test: `test/sms.test.ts`

**Interfaces:**
- Consumes: `moneyShort`, `weightLabel`, `Grams`, `Pesewas` from `@/lib/money`.
- Produces: `readyMessage(orderNo, order, grossPesewa)` where `order` is `{ method, weightGrams, items }` and `items` is `ReadonlyArray<{ name: string; qty: number }>`. Consumed by `advanceStatus`.

- [ ] **Step 1: Write the failing tests**

In `test/sms.test.ts` extend the import and add the tests. Replace the existing "ready and payment messages" test:

```ts
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
      readyMessage('LW-261014-003', { method: 'piece', weightGrams: grams(3500), items: [{ name: 'Bedsheet', qty: 1 }] }, pesewas(2000)),
    ).toBe('LAWMANN: your laundry is ready for delivery. 1 item: 1 bedsheet. GH¢20. Order LW-261014-003.');
  });

  it('a long item list is truncated, never a second segment', () => {
    const items = Array.from({ length: 30 }, () => ({ name: 'Bedsheet', qty: 1 }));
    const body = readyMessage('LW-261014-004', { method: 'piece', weightGrams: grams(3500), items }, pesewas(60000));
    expect(body.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    expect(body).toContain('ready for delivery');
    expect(body).toContain('Order LW-261014-004.');
  });
```

Add `readyMessage` to the segment-limit property test's list of bodies, replacing the old bare call:

```ts
            readyMessage('LW-260928-003', { method: 'band', weightGrams: grams(3500), items: [] }, pesewas(7800)),
            readyMessage('LW-260928-003', { method: 'piece', weightGrams: grams(3500), items: [{ name: 'Bedsheet', qty: 9 }, { name: '2-piece suit', qty: 3 }] }, pesewas(27000)),
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/sms.test.ts`

Expected: FAIL, `readyMessage` takes one argument.

- [ ] **Step 3: Implement the template**

Replace `readyMessage` in `src/lib/sms/templates.ts`:

```ts
export interface ReadyOrder {
  readonly method: 'band' | 'piece';
  readonly weightGrams: Grams;
  readonly items: ReadonlyArray<{ name: string; qty: number }>;
}

/** "2 shirts", "1 bedsheet", "1 2-piece suit". The plural is a plain s. */
function itemLabel(name: string, qty: number): string {
  const word = name.toLowerCase();
  return `${qty} ${word}${qty > 1 ? 's' : ''}`;
}

/** "1 bag, 3.5kg" for a weighed bag; "3 items: 2 shirts, 1 trouser" for a counted one. */
function whatIsReady(order: ReadyOrder): string {
  if (order.items.length === 0) return `1 bag, ${weightLabel(order.weightGrams)}`;
  const count = order.items.reduce((n, i) => n + i.qty, 0);
  return `${count} ${count === 1 ? 'item' : 'items'}: ${order.items.map((i) => itemLabel(i.name, i.qty)).join(', ')}`;
}

/**
 * The ready text, in the owner's words: "your laundry is ready for delivery",
 * then what is in the bag and what it costs. The order number closes, because
 * that is the thing the student copied down at intake.
 *
 * A weighed bag has no item list, so it is described as one bag and its
 * weight, which is the honest description. A long counted list is dropped to
 * its first lines until the body fits one segment: each extra segment costs
 * the owner money, so length is a design constraint, not a suggestion.
 */
export function readyMessage(orderNo: string, order: ReadyOrder, grossPesewa: Pesewas): string {
  const head = `LAWMANN: your laundry is ready for delivery.`;
  const price = ` ${moneyShort(grossPesewa)}. Order ${orderNo}.`;
  const what = whatIsReady(order);

  let body = `${head} ${what}.${price}`;
  if (body.length <= SMS_SEGMENT_LIMIT || order.items.length === 0) return body;

  const lines = [...order.items];
  while (lines.length > 0) {
    lines.pop();
    body = `${head} ${whatIsReady({ ...order, items: lines })}.${price}`;
    if (body.length <= SMS_SEGMENT_LIMIT) return body;
  }
  return `${head}${price}`;
}
```

Update the file header comment, which says "ready for collection", to "ready for delivery".

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/sms.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms/templates.ts test/sms.test.ts
git commit -m "SMS: the ready message names the items, how many, and the price"
```

---

### Task 3: Store the piece lines, send the new ready message

**Files:**
- Modify: `src/lib/orders.ts`
- Test: `test/orders.test.ts`

**Interfaces:**
- Consumes: `schema.orderItem`, the new `readyMessage`.
- Produces: item rows on every piece-priced order, and the ready body composed from them.

- [ ] **Step 1: Write the failing test**

In `test/orders.test.ts`, replace the ready-body assertion inside "walks the lifecycle":

```ts
    expect(messages[1]?.body).toBe(
      `LAWMANN: your laundry is ready for delivery. 1 bag, 3.5kg. GH¢78. Order ${created.orderNo}.`,
    );
```

And add a new test after it:

```ts
  it('the ready message lists the items of a piece-priced bag', async () => {
    const created = await createOrder(
      db,
      intake({ method: 'piece', pieces: [{ code: 'SHIRT', qty: 2 }, { code: 'TROUSER', qty: 1 }] }),
      session,
    );
    if (!created.ok) throw new Error('setup failed');
    await advanceStatus(db, created.orderId, 'washing', session);
    await advanceStatus(db, created.orderId, 'ready', session);

    const messages = await db.select().from(schema.smsMessage).orderBy(schema.smsMessage.createdAt);
    expect(messages[1]?.body).toBe(
      `LAWMANN: your laundry is ready for delivery. 3 items: 2 shirts, 1 trouser. GH¢16. Order ${created.orderNo}.`,
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/orders.test.ts`

Expected: FAIL on the band body, then on the piece body.

- [ ] **Step 3: Write the item rows at intake**

In `src/lib/orders.ts`, add a helper above `createOrder`:

```ts
/** The piece lines, in the order the counter picked them, for the ready message. */
async function writeItems(db: Writable, orderId: string, lines: NonNullable<IntakeInput['pieces']>): Promise<void> {
  const rows = lines.map((line, position) => {
    const item = PIECES.find((p) => p.code === line.code);
    if (!item) throw new Error(`${line.code} is not on the price list.`);
    return { orderId, code: item.code, name: item.name, qty: line.qty, position };
  });
  if (rows.length > 0) await db.insert(schema.orderItem).values(rows);
}
```

Call it inside `createOrder` immediately after the order insert returns `orderId`, before the payment block:

```ts
      if (input.method === 'piece') await writeItems(db, orderId, input.pieces ?? []);
```

The `pieceTotal` call above it already refuses an unknown code, so the throw is
unreachable in practice; it keeps the helper honest if it is ever called alone.

- [ ] **Step 4: Compose the ready message from the order and its items**

In `advanceStatus`, replace the ready branch:

```ts
  if (to === 'ready') {
    const students = await db.select().from(schema.student).where(eq(schema.student.id, order.studentId));
    const phone = students[0]?.phone;
    if (phone) {
      const items = await db
        .select({ name: schema.orderItem.name, qty: schema.orderItem.qty })
        .from(schema.orderItem)
        .where(eq(schema.orderItem.orderId, orderId))
        .orderBy(asc(schema.orderItem.position));
      await enqueueSms(db, {
        shopId: session.shopId,
        orderId,
        kind: 'ready',
        toPhone: phone,
        body: readyMessage(order.orderNo, { method: order.method as 'band' | 'piece', weightGrams: order.weightGrams, items }, order.gross as Pesewas),
      });
      await attemptSend(db);
    }
  }
```

Add `asc` to the `drizzle-orm` import.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/orders.test.ts`

Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: no output. The seed script still calls the old signature, so it fails here — that is Task 5.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orders.ts test/orders.test.ts
git commit -m "Orders: store the piece lines, and send a ready message that names them"
```

---

### Task 4: The condition photo operation

**Files:**
- Create: `src/lib/condition.ts`
- Modify: `src/lib/validation.ts`
- Create: `test/condition.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema`, `Session`; `translateDbError` conventions.
- Produces: `canPhotograph(role)`, `addConditionPhoto(db, orderId, input, session)`, `listConditionPhotos(db, orderId)`, `ConditionPhoto`, `MAX_PHOTO_CHARS`; `conditionPhotoSchema`.

- [ ] **Step 1: Write the test file**

Create `test/condition.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/lib/db/schema';
import type { Session } from '@/lib/auth';
import { intakeSchema } from '@/lib/validation';
import { advanceStatus, createOrder, getOrderDetail } from '@/lib/orders';
import { canPhotograph, listConditionPhotos, addConditionPhoto, MAX_PHOTO_CHARS } from '@/lib/condition';
import { freshDb, resetDb, seededShop, type ShopFixture, type TestDb } from './db';

/**
 * The evidence flow against real Postgres: a photograph of an item that
 * arrived already spoiled is written once with its reason and its author, it
 * refuses a bag that has already left, and it keeps a phone-sized image out
 * of an SMS-sized message.
 */

let client: PGlite;
let db: TestDb;
let fx: ShopFixture;
let session: Session;

/** A 4x4 red JPEG, the smallest thing that survives the round trip. */
const PHOTO = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//Z';

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

const shoot = (orderId: string, overrides: Record<string, unknown> = {}) =>
  addConditionPhoto(db, orderId, { note: 'ink on the collar', image: PHOTO, ...overrides }, session);

beforeAll(async () => {
  db = await freshDb();
  client = db.$client;
});

beforeEach(async () => {
  await resetDb(db);
  fx = await seededShop(db, client);
  session = { staffId: fx.staffId, name: 'Owner', role: 'owner', shopId: fx.shopId };
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/condition.test.ts`

Expected: FAIL, the module `@/lib/condition` does not exist.

- [ ] **Step 3: Add the schema to `src/lib/validation.ts`**

Append after `correctionSchema`:

```ts
/**
 * The photograph of an item that arrived already spoiled. The note is what
 * makes it evidence rather than a snapshot, so it is required; the image is
 * base64 the browser has already downscaled, and the size cap is the lib's
 * job because it owns the column.
 */
export const conditionPhotoSchema = z.object({
  orderId: z.string().uuid(),
  note: z.string().trim().min(3, 'Say what is wrong with the item.').max(120),
  image: z.string().min(1, 'Take the photograph first.'),
});
export type ConditionPhotoInputForm = z.infer<typeof conditionPhotoSchema>;
```

- [ ] **Step 4: Create `src/lib/condition.ts`**

```ts
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Db } from '@/lib/db';
import type { Session } from '@/lib/auth';
import type { ConditionPhotoInputForm } from '@/lib/validation';

/**
 * The evidence. A student hands over a bag with a stain already in it and
 * later says the shop put it there. The collector photographs the item at
 * the moment the bag is taken, with one line saying what is wrong, and the
 * shop has an answer.
 *
 * Three rules hold. The photograph belongs to an open bag, because the whole
 * point is the state of the item before the shop touched it. The note rides
 * with it, because an unlabelled photograph proves nothing. And it is written
 * once: it is a record, not a gallery, and it never reaches the student.
 */

/**
 * The base64 ceiling. A 1000px JPEG at quality 0.7 lands near 300KB, which
 * base64 inflates by a third; the cap sits well above that and well below the
 * 2MB server-action limit, so an honest photograph is never refused.
 */
export const MAX_PHOTO_CHARS = 1_400_000;

const OPEN: ReadonlySet<string> = new Set(['received', 'washing', 'ready']);

/** Every role may photograph: the collector at the hostel is the intended user. */
export function canPhotograph(role: Session['role']): boolean {
  return role === 'owner' || role === 'counter' || role === 'collector';
}

export type ConditionResult = { ok: true; photoId: string } | { ok: false; error: string };

function failure(error: string): ConditionResult {
  return { ok: false, error };
}

export async function addConditionPhoto(
  db: Db,
  orderId: string,
  input: ConditionPhotoInputForm,
  session: Session,
): Promise<ConditionResult> {
  const orders = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.shopId, session.shopId)));
  const order = orders[0];
  if (!order) return failure('Order not found.');
  if (!OPEN.has(order.status)) {
    return failure('That bag has already left. Only an open bag is photographed.');
  }
  if (input.image.length > MAX_PHOTO_CHARS) {
    return failure('That photograph is too large. Take a closer shot.');
  }

  try {
    const inserted = await db
      .insert(schema.conditionPhoto)
      .values({ orderId, staffId: session.staffId, note: input.note, image: input.image })
      .returning({ id: schema.conditionPhoto.id });
    const photoId = inserted[0]?.id;
    if (!photoId) throw new Error('condition_photo insert returned no row');
    return { ok: true, photoId };
  } catch (err) {
    const law = translateDbError(err);
    if (law) return failure(law.message);
    throw err;
  }
}

export interface ConditionPhoto {
  id: string;
  note: string;
  image: string;
  staffName: string;
  createdAt: Date;
}

/** The order's photographs, oldest first, for the Condition section. */
export async function listConditionPhotos(db: Db, orderId: string): Promise<ConditionPhoto[]> {
  const rows = await db
    .select({ photo: schema.conditionPhoto, staffName: schema.staff.name })
    .from(schema.conditionPhoto)
    .innerJoin(schema.staff, eq(schema.conditionPhoto.staffId, schema.staff.id))
    .where(eq(schema.conditionPhoto.orderId, orderId))
    .orderBy(asc(schema.conditionPhoto.createdAt));
  return rows.map((r) => ({
    id: r.photo.id,
    note: r.photo.note,
    image: r.photo.image,
    staffName: r.staffName,
    createdAt: r.photo.createdAt,
  }));
}
```

Add the missing `translateDbError` import:

```ts
import { translateDbError } from '@/lib/errors';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/condition.test.ts`

Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/lib/condition.ts src/lib/validation.ts test/condition.test.ts
git commit -m "Condition: the photograph of an item that arrived already spoiled"
```

---

### Task 5: The action, the camera form, and the order page

**Files:**
- Create: `src/app/actions/condition.ts`
- Create: `src/components/condition-photos.tsx`
- Modify: `src/app/(app)/app/orders/[id]/page.tsx`
- Modify: `scripts/seed.ts`

**Interfaces:**
- Consumes: `canPhotograph`, `addConditionPhoto`, `MAX_PHOTO_CHARS` from Task 4; `listConditionPhotos`; `conditionPhotoSchema`.
- Produces: `addConditionPhotoAction(_prev, formData)` returning `ConditionState`; `ConditionCamera`, the client form; the Condition section on the order page.

- [ ] **Step 1: Create the action**

Create `src/app/actions/condition.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { canPhotograph, addConditionPhoto } from '@/lib/condition';
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
```

- [ ] **Step 2: Create the camera form**

Create `src/components/condition-photos.tsx`:

```tsx
'use client';

import { useActionState, useRef, useState } from 'react';
import { Field, TextInput } from '@/components/ui';
import { FormError, PrimaryButton } from '@/components/form-buttons';
import { addConditionPhotoAction } from '@/app/actions/condition';
import { MAX_PHOTO_CHARS } from '@/lib/condition';

/**
 * The camera control. A file input with `capture` opens the phone's camera
 * and nothing else; on a desktop it is an ordinary file picker. The image is
 * downscaled here, in the browser, to a longest edge of 1000px, because a
 * 12-megapixel photograph is evidence of nothing the shop needs and costs
 * the owner a slow page.
 */

const MAX_EDGE = 1000;
const QUALITY = 0.7;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare the photograph.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export function ConditionCamera({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(addConditionPhotoAction, { ok: false });
  const [image, setImage] = useState('');
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem('');
    try {
      const base64 = await shrink(file);
      if (base64.length > MAX_PHOTO_CHARS) {
        setProblem('That photograph is too large. Take a closer shot.');
        return;
      }
      setImage(base64);
      setPreview(`data:image/jpeg;base64,${base64}`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That photograph could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setImage('');
    setPreview('');
    setNote('');
    if (fileRef.current) fileRef.current.value = '';
  };

  if (state.ok) {
    return (
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
        Photograph saved. It stays with the order as the record of how the item arrived.
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="image" value={image} />

      <Field label="Photograph the item" htmlFor={`photo-${orderId}`} hint="Opens the camera. One shot, close to the stain.">
        <input
          ref={fileRef}
          id={`photo-${orderId}`}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => void take(e.target.files?.[0])}
          className="w-full min-h-12 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-stone-100 file:px-4 file:text-sm file:font-semibold file:text-stone-800"
        />
      </Field>

      {preview ? (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="The item as it arrived" className="max-h-64 rounded-md border border-stone-200" />
        </div>
      ) : null}

      <Field label="What is wrong with it" htmlFor={`note-${orderId}`} hint="One line. It is what makes the photograph evidence.">
        <TextInput
          id={`note-${orderId}`}
          name="note"
          required
          maxLength={120}
          placeholder="ink on the collar"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <FormError error={problem || (state.ok ? undefined : state.error)} />
      {image ? (
        <div className="flex flex-col gap-2">
          <PrimaryButton>Save the photograph</PrimaryButton>
          <button type="button" onClick={reset} className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 font-semibold text-stone-800">
            Take another
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-500">Take the photograph first.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Add the items line and the Condition section to the order page**

In `src/app/(app)/app/orders/[id]/page.tsx`:

Add the import:

```ts
import { listConditionPhotos, canPhotograph } from '@/lib/condition';
import { ConditionCamera } from '@/components/condition-photos';
```

After the existing `const corrections = await listCorrections(db, id);` line, add:

```ts
  const photos = await listConditionPhotos(db, id);
  const canShoot = canPhotograph(session.role) && ['received', 'washing', 'ready'].includes(detail.order.status);
```

Read the order's items next to the corrections query:

```ts
  const items = await db
    .select({ name: orderItem.name, qty: orderItem.qty })
    .from(orderItem)
    .where(eq(orderItem.orderId, id))
    .orderBy(asc(orderItem.position));
```

with `orderItem` added to the schema import on line 5.

In "The bag" section, after the Weight row, add the items line:

```tsx
          {order.method === 'piece' && items.length > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Items</dt>
              <dd className="text-right font-medium">
                {items.reduce((n, i) => n + i.qty, 0)}: {items.map((i) => `${i.qty} ${i.name.toLowerCase()}${i.qty > 1 ? 's' : ''}`).join(', ')}
              </dd>
            </div>
          ) : null}
```

Place the Condition section immediately before the History section:

```tsx
      <Section title={`Condition (${photos.length})`}>
        {photos.length === 0 ? (
          <p className="mb-4 text-sm text-stone-500">No damage recorded. If an item arrived spoiled, photograph it now, before it is washed.</p>
        ) : (
          <ul className="mb-4 space-y-4">
            {photos.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/jpeg;base64,${p.image}`} alt={p.note} className="max-h-72 rounded-md border border-stone-200" />
                <p className="mt-1 text-sm text-stone-800">{p.note}</p>
                <p className="text-xs text-stone-500">
                  {p.staffName} · {formatDate(p.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canShoot ? (
          <details className="rounded-lg border border-stone-200 bg-stone-50">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-stone-700">
              Photograph a stain
            </summary>
            <div className="border-t border-stone-100 p-4">
              <ConditionCamera orderId={order.id} />
            </div>
          </details>
        ) : null}
      </Section>
```

- [ ] **Step 4: Update the seed's ready call**

In `scripts/seed.ts`, replace the ready body:

```ts
          body: readyMessage(order.orderNo, { method: 'band', weightGrams: grams(weight), items: [] }, gross),
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`, then `npm run build`.

Expected: typecheck silent, build succeeds. The `<img>` with a base64 `src` is deliberate: there is no image optimizer input for a data URL, and routing every photograph through `/_next/image` would cost the owner a server round trip for a private record.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/condition.ts src/components/condition-photos.tsx "src/app/(app)/app/orders/[id]/page.tsx" scripts/seed.ts
git commit -m "Condition: the camera on the order page, and the item list beside the weight"
```

---

### Task 6: Full verification

- [ ] **Step 1: Every test**

Run: `npm test`

Expected: PASS, every file.

- [ ] **Step 2: The full build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/
git commit -m "Plan: condition photos and a ready message that says what is in the bag"
```
