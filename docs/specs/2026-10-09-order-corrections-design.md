# Lawmann order corrections design

Approved in working session, 9 October 2026. Companion to the business core
spec (`2026-09-28-v1-core-design.md`) and the public site spec
(`2026-09-29-public-site-design.md`).

## Purpose

Today a mis-keyed weight, a wrong student attached by a typo'd phone, or a
mistyped price can only be undone by cancelling the order and recording it
again. That workaround pollutes the daily order sequence
(`nextOrderNo` in `src/lib/orders.ts`), sends the student a duplicate
"accepted" SMS, splits one bag across two records in every report, and leaves
the original mistake invisible. This build adds honest corrections: the bag
record is fixed in place, the mistake stays visible, and everything downstream
(receipts, reports, tax, balances) follows the corrected figures.

## Decisions from the session

1. **Scope — everything editable.** A correction can change the weight (band
   orders) or the total (piece orders), the attached student, the location the
   bag was taken at, and the promised date. Piece orders never stored their
   items (only `method` and `gross` on the order row), so the corrected total
   is the only honest piece-order fix.
2. **Roles — owner and counter.** Same split as confirming MoMo and cancelling
   an order: the counter made the typo and should fix it before the bag moves
   on, and the audit trail is the accountability. Collectors never see the
   form.
3. **Timing — open orders only.** `received`, `washing`, `ready`. `collected`
   and `cancelled` are history: the money has moved and the bag is gone, so the
   figure stands. No refund paths exist and none are built.
4. **Overpayment — allowed, flagged.** Correcting a 3.5kg bag down to 2.9kg
   after the student already paid GH¢78 leaves them GH¢5 overpaid. The order
   page shows a red "Refund due GH¢5"; the counter hands it back in cash. No
   payment reversal is built (see Exclusions).
5. **Notification — amended SMS.** A weight or price correction sends one
   amended SMS through the existing outbox, because the student's "accepted"
   message quoted the old figure and a silent change is a dispute waiting at
   collection. Location and date fixes stay internal.

Alternatives rejected in session: field-by-field mini forms (five code paths,
five audit shapes, no atomicity); versioned order rows (breaks order-number
uniqueness, payment links, SMS threads, and every query assuming one row per
bag). Chosen approach: one atomic correction operation.

## Architecture

### Data model

New table `order_correction`, generated through `npm run db:generate` from
`src/lib/db/schema.ts` (the schema comment's rule: migrations are generated,
never hand-written):

- `id`, `order_id` (FK → orders, cascade), `staff_id` (FK → staff), `at`
- `field` — pgEnum `correction_field`: `weight | price | student | location |
  promised_date`
- `from_value` / `to_value` — text, the human form ("3.5kg" → "2.9kg",
  "0241234567" → "0249999999"); an audit record, not typed data
- `note` — the counter's reason, repeated on each row of one correction

`orders` loses no columns and gains none: the stored split (gross, base, vat,
nhil, getfund) is rewritten in place. The `orders_tax_foots` constraint in
`src/lib/db/triggers.sql` is what makes the re-split safe.

`sms_kind` gains `corrected`, so amended messages are distinguishable from the
original three on the messages page.

### The correction operation

New file `src/lib/corrections.ts`, separate from `orders.ts` (which is already
465 lines and owns intake, not repair). One exported function, db-first like
every other lib here:

```
correctOrder(db, orderId, input, session) → CorrectionResult
```

`input` is the intended record: `weightKg` (band) or `totalGhs` (piece),
`phone`, `locationId`, `promisedOn` (nullable), `note`.

1. Load the order; refuse `collected` and `cancelled` in words. The collector
   block lives at the action layer, exactly as `confirmMomoAction` does.
2. Re-price. Band orders go through `priceAgainstBands` against the DB band
   table, so the gap-surcharge rule applies to corrections identically to
   intake. Piece orders take the submitted total as the gross. Either way the
   split is recomputed through `splitTaxInclusive`, and `orders_tax_foots`
   then guarantees the return still reconciles.
3. Diff intended against current (weight, gross, phone, location, promise
   date). A no-op correction is refused: "nothing is different on this order".
4. One transaction: update the order row (weight, gross, the four levy
   columns, student, location, promisedAt), insert one `order_correction` row
   per changed field, enqueue the amended SMS when the money moved. The SMS
   send attempt happens after commit, as `takePayment` does — a gateway call
   never sits inside a transaction.
5. Student cleanup: when the phone changed, the vacated student row is deleted
   if no order references it, so a typo'd intake leaves no phantom in the
   student list forever.

Refund-due needs no new mechanism: the `order_balances` view computes a
negative `balance_due` naturally, and every report stays correct because
revenue sums payments and the tax summary sums the stored split.

The audit rows are also the conflict story: two devices correcting the same
bag means last-write-wins on the row with both corrections recorded — the same
bet the `forward_only_status` trigger already makes for offline collectors.

### Action and form

`src/app/actions/corrections.ts`, thin like its siblings: `requireSession`,
owner-or-counter guard, a zod `correctionSchema` (weight or total depending on
method, phone via `normalizePhone`, location uuid, optional promised date,
required note ≤ 120 chars), call `correctOrder`, revalidate the order page,
the orders list, activity, and messages.

The order detail page (`src/app/(app)/app/orders/[id]/page.tsx`) gains a
"Correct this order" `<details>` block, styled like the existing "Danger zone"
one, visible only for owner/counter on open orders. One form, pre-filled with
the current record:

- Weight in kilos (band orders) with the same live price preview as intake —
  the form shows "GH¢73 · up to 3kg band" as the counter types, using the
  shared `priceAgainstBands`, so nobody saves a correction blind. The active
  bands are fetched the same way `orders/new` fetches them.
- Price in cedis (piece orders), typed by hand as it is at intake.
- Student phone, location select, and the optional ready date.
- A required reason field ("scale slipped", "wrong bag"), carried on every
  audit row.

Success line mirrors intake: `Corrected · 2.9kg · GH¢73`.

### Order page and activity

- `getOrderDetail` returns corrections alongside events; the History section
  merges both trails in one time-ordered list:
  `received → washing · Owner · 14:02` next to
  `weight 3.5kg → 2.9kg · Auntie Muni · 15:40`.
- The "Still owing" row gains a red `Refund due GH¢5` state for a negative
  balance, replacing today's silent "Settled". The arrears page is unchanged
  (it lists what is owed, not what is refundable).
- `src/lib/activity.ts` gains a `correction` kind — "Auntie Muni corrected the
  weight on LW-261009-014" — so the owner's diary shows corrections the day
  they happen. The messages page shows amended texts with their new kind.

### SMS template

`correctedMessage(orderNo, weightLabel, gross, balance)` in
`src/lib/sms/templates.ts`, hard-capped at the same 160-char segment budget
every template obeys (an extra segment costs the owner GH¢0.022) and guarded
by the existing segment test. Sent only when the weight or price changed.

## Edge cases

- Correcting twice in a day: each correction writes its own rows. Intended.
- A piece-order total below the sum its items would have cost: allowed — it is
  the owner's call, which is what the note field is for.
- The SMS gateway is down: the correction still commits, the message stays
  queued and shows "Waiting for gateway", never faked as sent.
- Correcting the student while a MoMo payment is pending: payments hang off the
  order, so nothing moves but the attached student.
- Two devices correcting the same bag: last-write-wins on the row, both
  corrections in the audit trail.

## Tests

`test/corrections.test.ts`:

- Weight correction re-prices through the tariff (gap rule included) and
  re-splits with the foot intact.
- Piece-total correction.
- A no-op correction is refused.
- `collected` and `cancelled` orders refused in words.
- Student re-parent moves the order; payments stay attached; the vacated
  student row is deleted when unreferenced and kept when it has other orders.
- A downward correction below what was paid yields a negative balance the
  order page can render.
- The amended SMS is enqueued only when the money moved; location and date
  fixes stay silent.
- Audit rows capture field, from, to, staff, and note.
- The activity feed gains the correction entry with who, order number, and
  field, in day order.
- The collector role is refused at the action layer.

The templates test picks up the new segment-count guard for free.

## Exclusions (deliberately not built)

- Payment reversal or a refund ledger — the refund-due flag is enough; real
  refunds happen in cash at the counter.
- Editing or reversing past payments.
- Corrections on collected orders.
- Live price preview for piece totals — the number is typed by hand, as at
  intake.

## Files touched

- `src/lib/db/schema.ts` — `order_correction` table, `correction_field` enum,
  `corrected` in `sms_kind`
- `drizzle/0003_*.sql` — generated
- `src/lib/corrections.ts` — new
- `src/app/actions/corrections.ts` — new
- `src/lib/orders.ts` — `getOrderDetail` returns corrections
- `src/lib/activity.ts` — correction entries in the feed
- `src/lib/sms/templates.ts` — `correctedMessage`
- `src/app/(app)/app/orders/[id]/page.tsx` — correct form, merged history,
  refund-due line
- `src/components/order-detail-actions.tsx` — the correction form client
  component
- `test/corrections.test.ts` — new
- `test/sms.test.ts` — segment guard covers the new template
