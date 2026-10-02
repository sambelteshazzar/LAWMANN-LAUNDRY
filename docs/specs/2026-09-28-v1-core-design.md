# Lawmann v1 — business core design

Approved in working session, 28 September 2026. This is the contract for the first
build. Everything here was decided against the owner proposal (`build_proposal.py`
content) and the meeting agenda (`docs/owner-meeting-agenda.md`), with research into
how commercial laundry systems are built (CleanCloud, the POS market leader) and
verified Ghana specifics (tax structure, SMS gateway pricing and endpoint).

The proposal's build order governs: money first, then profit, then the owner's phone,
then customer messages. This build covers steps 1–4. Route planning (step 6) waits.

## Purpose

Answer the owner's six questions with numbers that reconcile:

1. How much money came in today — confirmed payments only, pending MoMo shown separately.
2. How much people still owe — every open order with a balance, oldest first.
3. How many people paid — count and who.
4. Who paid half and owes the rest — per-order balances follow the bag to collection.
5. How many people came in today, this week, this month — measured intake.
6. How customers know it is ready — SMS on acceptance, ready, and payment.

Plus the part nobody has today: what it actually costs to wash a kilo, against the
GH¢10.67 per-kilo the thinnest band earns.

## Surfaces and roles

One app, three experiences, role-gated. Not three apps.

| Who | Sees | How |
|---|---|---|
| Students | SMS only: accepted, ready, payment. No login, no install. | Arkesel SMS |
| Collector | Intake, orders, payments, mark ready (fires SMS), arrears with contact details | PIN login |
| Counter | Collector's views plus shift and outbox management | PIN login |
| Owner | Everything, plus money figures, activity feed, reports, staff PINs, costs | PIN login |

PIN login is the POS industry standard (CleanCloud and peers). scrypt via
`node:crypto`, no new dependency. Signed HTTP-only cookie session, HMAC with
`SESSION_SECRET`. Wrong-PIN throttle: 3 failures → pause. Owner manages PINs at
`/staff`.

Roles come from the existing `staff_role` enum: owner, counter, collector.
Enforced in server actions and page guards, not just hidden buttons.

## Database

Dev and the demo run on PGlite persisted to `.pglite/` (gitignored) — real embedded
Postgres; the triggers and constraints run as written. Production swaps the driver in
`src/lib/db/index.ts` via `DATABASE_URL` (docker-compose Postgres 17 + nightly dump
already in `infra/`). One file changes.

Boot sequence, at first query in dev:
1. drizzle migrations from `./drizzle`
2. `triggers.sql` (the only hand-written SQL)
3. assert `EXPECTED_COLUMNS` against `information_schema` — fail loudly if the live
   database and `schema.ts` disagree

### Migration 0001 — auth, accountability, messages

Generated from `schema.ts`, never hand-edited:

- `staff` `+ pin_hash text` (nullable; no PIN means cannot log in)
- `orders` `+ recorded_by uuid` → staff (nullable)
- `payment` `+ recorded_by uuid` → staff (nullable)
- `sms_message` — the transactional outbox:
  `id, shop_id, order_id (nullable), to_phone, body, kind ('accepted'|'ready'|'payment'),
  state ('queued'|'sent'|'failed'), provider, provider_ref, error, created_at, sent_at`
- `order_event` — status moves: `id, order_id, from_status, to_status, staff_id, at`
  (`ready_at` tells the owner when; `order_event` tells them who)

Nothing else in the schema changes. The existing triggers and constraints remain the
only place the money laws live; nothing is re-implemented in TypeScript.

## Pages

- `/login` — pick name, enter PIN
- `/` — owner home: confirmed revenue today, payments count, pending MoMo count,
  orders by status, top five oldest arrears, shift state, this week's costs.
  Collector's home redirects to intake.
- `/activity` — everything that happened, derived by UNION over orders (created,
  promised, ready, collected, cancelled — via `order_event` and order timestamps),
  payments, costs, shifts, sms. Filter by day, actor, kind. Owner and counter only.
  Derived, never materialized: it cannot drift because it is the data.
- `/orders` — list, filter by status, default open orders
- `/orders/new` — intake (below)
- `/orders/[id]` — detail: weight, price, tax split, payments, status timeline,
  actions: advance status, take payment, confirm MoMo, cancel
- `/orders/[id]/receipt` — print-friendly receipt: order number, date, student,
  weight, method, gross, base/VAT/NHIL/GETFund split, payments, balance. Prints to
  a thermal printer if one appears. SMS remains the student's receipt; this is the
  counter's copy and the GRA story.
- `/arrears` — every open order with balance > 0, oldest first, with phone and room
- `/costs` — enter weekly bills by category, list with weekly totals
- `/reports` — the profit side (below)
- `/messages` — SMS outbox: state, recipient, body, retry, send-all-waiting
- `/shifts` — open/close with float and counted cash; variance against expected
- `/staff` — owner manages staff and PINs

## Intake flow (`/orders/new`)

One phone screen, five sections, thumb-sized targets, minimal typing:

1. **Student.** Phone number first (the per-shop identity). Existing student:
   autocomplete plus "owes GH¢X from LW-…" if arrears exist. New: name and room
   optional at capture.
2. **Weigh.** Numeric keypad, kg with two decimals, stored as integer grams. Live
   band and price while typing.
3. **Price.** Bands read from the `band` table (seeded from `pricing.ts` constants,
   so the owner can change prices without a code change). Piece pricing is an
   override with quantities. Over 15 kg shows "No price covers 16.5 kg. The price
   list stops at 15 kg." and blocks — the collector asks, the app never guesses.
   Weight is mandatory even on piece-priced orders (cost basis is per kilo).
4. **Payment.** None (balance tracks), cash (trigger-enforced ≤ balance), or MoMo
   (transaction ref from the SMS, state `pending_momo` until the owner confirms).
   Presets: full remaining, half, custom.
5. **Confirm.** Summary, save, order number shown large. Tax split computed once at
   creation and stored — a later rate change must not rewrite a filed return.

Order numbers: `LW-YYMMDD-NNN`, per-shop daily sequence, retried on unique
collision.

Offline posture: online-first, retry-safe. Client-generated UUIDs (already the
design), drafts persist on the device, failed saves show "Not saved — tap to retry"
and re-submit safely. The full offline queue waits for phase 2; the idempotency
keys already make it safe to add without schema changes.

## SMS

Verified live: `POST https://sms.arkesel.com/api/v2/sms/send`, `api-key` header,
JSON `{send_to, from, sms}`. 401 with invalid key confirmed 2026-09-28. Cost
~GH¢0.022 per segment at volume.

Transactional outbox: every message is written `queued` first, then the send is
attempted → `sent` or `failed`. Intent is never lost. No `ARKESEL_API_KEY` set →
messages stay `queued` and the outbox says so. Nothing is ever faked as sent. For
the demo this is a feature: the owner reads exactly what each student would
receive, before spending a pesewa.

Three templates, single SMS segment each (each segment costs money):

- Accepted: "Lawmann: bag received for {name}. {weight}, {price}. Balance owing
  GH¢{x}. Order {orderNo}."
- Ready: "Lawmann: your laundry is ready for collection. Order {orderNo}."
- Payment: "Lawmann: GH¢{x} received for {orderNo}. Balance owing GH¢{y}."

Ready fires when staff mark ready. Payment fires on cash capture and when the owner
confirms a pending MoMo. Retries: manual from `/messages` until there is a worker.

## Reports

- Revenue: confirmed payments in period; pending MoMo shown separately, never mixed.
- Intake counts: day, week, month, plus custom range.
- Arrears: `order_balances` view, oldest first.
- Cost per kilo: operating costs ÷ kilos washed in period, against the thinnest
  band's per-kilo (`thinnestBand()`, currently GH¢10.67). The headline number.
- Band mix: orders, kilos, revenue and earned-per-kilo per band, against break-even —
  the "which band quietly costs you money" table.
- Tax summary: base, VAT, NHIL, GETFund sums for a period — the filed-return figures.

Range presets: Today, This week, This month, Last month, All. "Same week last
term" needs the university's academic calendar, which the owner has not provided;
it is on the agenda, not faked in software.

## Money and errors

Integer pesewas everywhere; no float touches money in any layer. Zod validation at
every action boundary. Server actions return typed results; trigger violations are
caught and translated ("Payment of GH¢50 exceeds the remaining balance of GH¢30").
Replays on idempotency keys (client order UUID, `gateway_ref`) return success —
that is the documented design. Backwards status moves are rejected with the
trigger's own words.

## Testing

- `test/tax.test.ts` — property tests (`fast-check` dev dependency; the
  highest-risk arithmetic): components sum to exactly the total, each within one
  pesewa of exact, deterministic.
- `test/pricing.test.ts` — band-gap assumption (3.5 kg → GH¢93 band), over-15 kg
  refusal, thinnest band, piece-quote validation.
- `test/money.test.ts` — guards and formatting, including the 3050 g → "3.1kg" trap.
- `test/triggers.test.ts` — against real PGlite: over-balance payment rejected,
  backwards status rejected, collected/cancelled frozen, tax-foots enforced,
  `gateway_ref` replay is success.
- SMS template tests: figures from integer pesewas, segment length.
- Provider test: mocked HTTP.

## Seed (`scripts/seed.ts`)

The real business: shop with MoMo number, 17 hostels as campus locations plus the
store, tariff bands from `pricing.ts`, staff with PINs, ~50 orders over six weeks
weighted toward small bags, mixed payments (cash, confirmed MoMo, pending MoMo,
partial), operating costs weekly, one shift. Realistic enough that every dashboard
number is obviously wrong if the arithmetic is wrong.

## Non-goals for v1

Customer tracking page (phase 4, ships with the SMS links), offline queue (phase 2,
documented), MoMo API, route planning, payroll, multi-store, receipts by SMS link,
"same week last term" comparison. Each is in the proposal's later steps or the
agenda's open questions; none is silently dropped.

## Open items (owner, not software)

- Arkesel account, ~GH¢50 top-up, API key, "Lawmann" sender ID
- Cost per kilo, all in (section 6.1 of the proposal)
- Academic calendar for term-over-term comparison
- Whether a paper ticket is handed out today, and what it shows
- Deployment target for the demo (laptop vs VPS) — decided when the date is known
