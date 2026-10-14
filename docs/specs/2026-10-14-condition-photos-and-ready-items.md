# Spec: condition photos and a ready message that says what is in the bag

**Status:** proposed, 14 October 2026
**Feature branch:** n/a — direct to main, as every feature before it.

## The problem

Two gaps, both from the owner.

**1. A disputed stain has no evidence.** A student collects a bag and says the
shop spoiled it. The shop has no photograph showing the stain was already
there when the bag was handed over. The collector needs a place, on the phone
they already carry, to photograph a spoilt or stained item at the moment the
bag is taken.

**2. The ready message says nothing about what is ready.** Today it reads
`LAWMANN: your laundry is ready for collection. Order LW-260928-003.` The
student is told to come and collect, but not how many things, which things,
or what it costs. At handover there is nothing to check against.

## What gets built

### A. Condition photos

A photograph, with one line of note, attached to an order, taken by the staff
member who spotted the damage. It is internal evidence: it never reaches the
student, it is never sent anywhere.

- New table `condition_photo`: order, staff, note, image, taken at.
- The image is a base64 JPEG, downscaled in the browser to a longest edge of
  1000px before it leaves the phone. It is stored, never written to disk.
- Any signed-in staff member may take one; the collector is the intended
  user. Only an open bag (received, washing, ready) may be photographed,
  because the whole point is the state of the item *before* the shop touched
  it.
- The order page gains a "Condition" section: the photographs already taken,
  and the camera control to take another.

### B. The ready message

`your laundry is ready for delivery` — the owner's words, replacing
"collection" — followed by the number of items, the item list, the price, and
the order number.

- `LAWMANN: your laundry is ready for delivery. 3 items: 2 shirts, 1 trouser.
  GH¢24. Order LW-261014-002.`
- `LAWMANN: your laundry is ready for delivery. 1 bag, 3.5kg. GH¢78. Order
  LW-261014-001.`

A bag priced by weight has no item list; it is one bag and its weight, which
is the honest description. A bag priced by item carries the lines the counter
entered at intake, so they must be stored.

- New table `order_item`: order, code, name, quantity, position. Written once
  at intake, for piece-priced orders only. Band orders carry none.
- The item list is a description of what was handed over, not a pricing
  source; the gross lives on the order and stays the single source of price.
  A correction that moves the price therefore moves the message's figure and
  leaves its list alone, which is the correct behaviour.

## Constraints inherited from the codebase

- One SMS segment, 160 characters. A long item list is truncated rather than
  allowed to cost the owner a second segment.
- Integer pesewas and grams, no float, anywhere near money.
- Lib functions take the database first and stay pure of Next.js; actions stay
  thin; the database is the final judge.
- Ops skin unchanged: white and stone neutrals, teal accent, `min-h-12` touch
  targets, `Field`/`TextInput` primitives, `Section`, `details` + `summary`
  for the collapsed form.
- Migrations are generated from `schema.ts`, never hand-written.
- Verification before each commit: `npm run typecheck` and the relevant tests.
  `npm run build` before the last one.

## Deliberately out of scope

- Editing or deleting a photograph. It is evidence; it is written once.
- Showing a photograph to the student, or sending one by SMS.
- Item lists on the receipt or the reports. The message is the ask.
- A correction that changes the item list of a piece-priced order.
- The activity feed. Photos live on the order page, nowhere else.
