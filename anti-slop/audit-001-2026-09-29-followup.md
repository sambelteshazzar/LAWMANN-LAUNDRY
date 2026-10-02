# audit-001 follow-up, 2026-09-29

Fixes applied for the findings in `anti-slop/audit-001-2026-09-29.md`, per the
approved plan (`docs/plans/2026-09-29-public-site.md`). Verification evidence
in the Delivery Gate report below.

## Findings fixed

- **Finding 1 (domain root requires staff PIN, HIGH):** fixed. The root is now
  the public landing (`src/app/(public)/page.tsx`); the ops surface lives at
  `/app/*` and login at `/app/login`. Evidence: `/` renders the landing with no
  session; owner login lands on `/app`; collector login lands on
  `/app/orders/new`.
- **Finding 2 (no brand identity, HIGH):** fixed in structure. DESIGN.md at
  the project root, Plus Jakarta Sans on both surfaces (one typeface, one
  identity), and the fold-line motif. The text wordmark stands in for a logo
  until the owner supplies one; still an open item.
- **Finding 3 (no customer-facing surfaces, HIGH):** fixed. Landing with the
  real flow, pricing teaser, areas (17 halls), and trust claims; `/pricing`
  with the real band and piece tariffs imported from `pricing.ts`; `/contact`
  with WhatsApp first.
- **Finding 4 (login is the front door, MEDIUM):** fixed. Staff login is a
  footer-corner link on the public surface, the way Rinse and Tide Cleaners do
  it.
- **Finding 5 (no product name on mobile, LOW):** resolved by inspection, no
  change needed. The ops sticky header already shows "Lawmann Laundry" at
  every breakpoint; the audit overstated this one.

## Open items still with the owner

- Confirm the customer-facing WhatsApp number (site.ts uses the seed's
  0556351853)
- Business hours and the shop's exact physical address
- Real photos of the shop/laundry (the hero shows a labeled placeholder until
  then)
- Real FAQ questions, or the FAQ stays out
- Wording confirmation: pickup from halls vs drop-off at the shop

## Delivery Gate report (public site)

Hard Gate: all PASS.
- R-02 PASS: em dash scan of site.ts, public.tsx, (public)/, DESIGN.md: clean
- R-03 PASS: 375px scrollWidth 375 = innerWidth 375; tables inside container;
  min-h-12 (48px) on every interactive element
- R-17/R-18/R-36 PASS: prices imported from pricing.ts (GH¢73.00-190.00
  verified against the source); areas from the seed list; no testimonials, no
  invented stats, no fabricated claims
- R-23 PASS: photo placeholder labeled "Real photo of the shop goes here
  (owner to provide)"; hours line is honest ("Call or message us to confirm
  today's hours")
- R-24 PASS: header/footer links only to pages that exist (Pricing, Contact,
  Staff login); landing links to /pricing
- R-25 PASS: teal-800/white 7.58:1, stone-600/white 7.63:1, stone-500/stone-50
  4.59:1, white/teal-800 7.58:1 (contrast-check.py, all PASS)
- R-26 PASS: every link verified with a real href and navigation (wa.me,
  tel:, /pricing, /contact, /app/login, wordmark to /)
- R-27 PASS: static content pages; login flow has error and throttle states
  from the ops build
- R-32 PASS: focus styles from the ops build carry over; interactive elements
  are native links and buttons
- R-35 PASS: ran the build and clicked through every control with evidence
  (listed above and in the task log)

Purpose-Gate: all PASS with written reasons.
- R-01 PASS: no gradients; palette is white/stone + teal accent (DESIGN.md)
- R-04 PASS: no icons in the public surface; nothing generic added
- R-06 PASS: Plus Jakarta Sans, chosen for brand character, reason in
  DESIGN.md
- R-08 PASS: no decorative arrows on buttons
- R-09 PASS: the only chip labels are real (dry-clean eligibility)
- R-14 PASS: sections vary in composition by content (hero, numbered flow,
  table teaser, chip cloud, definition grid, centered close)
- R-19 PASS: MOTION 1 held: hover states only, no template animation stack

Liveliness: all PASS.
- Dials explicit: ENERGY 2 / RHYTHM 2 / MOTION 1 (DESIGN.md)
- RHYTHM 2 held: sections visibly vary
- One focal point per screen: hero headline and WhatsApp CTA
- Whitespace structural; one deliberate accent (teal)
- Identity motif present: the fold line between every section

Craftsmanship: all PASS.
- C-1 PASS: every decision has a written reason (DESIGN.md, spec)
- C-2 PASS: no dead controls
- C-3 PASS: every section exists because the content needs it; no FAQ and no
  testimonials because the business has neither on record
- C-4 PASS: works at 375px and 768px, without JavaScript (links and content
  are server-rendered), keyboard navigable
- C-5 PASS: nothing presented as fact that is not real
