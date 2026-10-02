# Lawmann public site design

Approved in working session, 29 September 2026. Companion to the business core
spec (`2026-09-28-v1-core-design.md`). Everything here was decided against the
audit (`anti-slop/audit-001-2026-09-29.md`), competitor research (Rinse, Tide
Cleaners, JN Laundry Solutions, Smile Laundry GH), and the owner's answers in
session: the site's primary job is getting students to book, the honest CTA is
WhatsApp / phone call, and the visual direction is clean & fresh.

## Purpose

The business core app is the back-of-house system and stays that way. What is
missing is a public face: today the domain root requires a staff PIN, so any
student, partner, or landlord sees "Who is working?". This build adds the
public surface that sells, and tucks the staff login away the way every
professional competitor does (Rinse's login is a nav-corner link;
Tide Cleaners' app login lives on a separate subdomain).

## Direction (DESIGN.md)

Written to `DESIGN.md` at the project root; both surfaces follow it.

- Identity: Lawmann Laundry, campus laundry service for University of Ghana
  (Legon) students.
- Personality: clean, fresh, trustworthy, warm; student-affordable, not
  aspirational.
- Palette: white/stone neutrals + teal accent. Teal carries the
  water-and-cleanliness cue and is the continuity thread with the ops app.
  Green stays reserved for "ready" status in ops; red/amber are status-only.
  No gradients. 2-3 core colors + 1 accent (R-29).
- Typography: Plus Jakarta Sans via `next/font` (self-hosted, zero layout
  shift) for both surfaces. Reason: a friendly humanist sans that reads
  student-warm without losing professionalism, and gives the public surface an
  identity the system font stack cannot. System stack remains the fallback.
- Dials: ENERGY 2 / RHYTHM 2 / MOTION 1.
- Identity motif: the "fold line" — a soft horizontal crease that separates
  the hero from content and repeats between sections, echoing a pressed
  shirt fold. The stamped order numbers (`LW-…`) already carry the identity
  in the ops app.

## Architecture

One codebase, two route groups, one deploy.

- New public group `src/app/(public)/`:
  - `/` — landing
  - `/pricing` — full tariff
  - `/contact` — WhatsApp, phone, hours, location
- Ops group moves under `/app`: `src/app/(app)/*` pages move to
  `src/app/(app)/app/*`, so the ops surface serves `/app/*` and the login
  moves from `/login` to `/app/login`.
- Session redirects updated accordingly (`/` → `/app`,
  `/orders/new` → `/app/orders/new`, and the login redirect targets).
- Public header: wordmark + Pricing, Contact + WhatsApp CTA. "Staff login"
  lives only in the footer corner.
- All public pages are server-rendered static content: WhatsApp links and
  tel: links work without JavaScript; every page is mobile-first like the ops
  app (R-03).

Alternatives rejected in session: landing at a subpath with ops untouched
(does not fix the front door), separate marketing app (two deploys, design
drift, overkill).

## Landing page (`/`)

Content-driven composition, section order follows the customer's decision
flow. Every claim is real (R-17, R-18, R-36).

1. **Hero.** One focal point: the headline and the WhatsApp CTA.
   Draft copy (owner approves, R-37): headline "Your laundry, weighed and
   washed." Subline: "Lawmann washes by the kilo, not by estimate, and texts
   you at every step." CTAs: "Message us on WhatsApp" (wa.me deep link) and
   tap-to-call. No "Get Started", no banned buzzwords (R-15, R-16).
   Photography: real photos of the shop or laundry; owner supplies. Until
   then, labeled `[REAL PHOTO]` placeholders, never stock-faked (R-23).
2. **How it works.** Built from the actual flow, not the AI-default three
   round-icon steps (R-05): message on WhatsApp → bag weighed and washed,
   billed by the kilo → texted when it is ready → pay by MoMo or cash at
   collection. Rendered as a real numbered flow with the specifics of this
   business.
3. **Pricing teaser.** "Bags from GH¢73" with the band table one tap away at
   `/pricing`. Sourced from the shop poster plus the owner's corrections
   (`src/lib/pricing.ts`).
4. **Areas.** The 17 real campus locations from the seed list: Evandy,
   International Student Hostel, Pentagon (Blocks A & B), Vikings, Bani,
   TF Hostel, Aseda Annex A, Valco, Hilla Limann, Kwapong, Elizabeth Sey,
   Jean Nelson Aka, Legon Hall, Mensah Sarbah, Akuafo, Volta, Commonwealth.
   Verified against `scripts/seed.ts` at write time; re-verified at build.
5. **Trust.** The real differentiators: weighed by the kilo, SMS updates at
   every step, VAT/NHIL/GETFund-compliant receipts, MoMo or cash. No
   testimonials (R-18): the business has none on record, so there is no
   testimonials section.
6. **Contact.** WhatsApp CTA repeated, hours, location.

FAQ: none in this build. The owner has not supplied real questions students
ask; a generic FAQ damages trust (R-28). It joins the open items.

## Pricing page (`/pricing`)

- The five weight bands with real GH¢ figures (0-3kg GH¢73, 4-6kg GH¢93,
  7-9kg GH¢103, 10-12kg GH¢128, 13-15kg GH¢190), rendered as a clean table
  with tabular figures.
- The piece price list (17 items, shirt GH¢8 through duvet GH¢70), with
  dry-clean-eligible pieces flagged (kaftan, 2-piece suit, smock, sneakers).
- The honest note: nothing is priced above 15kg, so heavier bags are a
  "ask us" case, never a guessed price.
- Band edges await the owner's written confirmation of the cumulative
  reading (`BAND_GAPS_ASSUMED` in `pricing.ts`); the page states prices
  come from the shop tariff without asserting the contested reading.

## Contact page (`/contact`)

- WhatsApp deep link and tap-to-call. The number comes from the seed's
  shop record (0556351853) and must be confirmed by the owner as the
  customer-facing WhatsApp line before launch (open items).
- Business hours and the shop's physical location: owner supplies, or the
  page ships with labeled placeholders (R-23).

## What moves in the refactor

- `src/app/(app)/*` page files one level deeper (`(app)/app/...`)
- `/login` → `/app/login` (page + login form import path)
- Session redirect targets and any hardcoded links to `/` inside the ops
  group
- Root metadata title on the landing page becomes the public product title

## Testing and verification

- `npm run build`, `npm run typecheck`, `npm run test` all pass; existing
  tests unaffected by the route moves.
- Click-through evidence: public nav (Pricing, Contact), WhatsApp CTA opens
  wa.me, tap-to-call opens tel:, staff login link reaches `/app/login`,
  owner/collector logins land on the right surfaces.
- Mobile breakpoints 375px and 768px: no horizontal overflow, 44px+ tap
  targets, fold-line motif renders.
- Contrast: teal on white and stone-on-white meet WCAG AA (R-25).

## Open items (owner, not software)

- Confirm the customer-facing WhatsApp number (seed says 0556351853)
- Business hours and shop physical location
- Real photos of the shop/laundry for the hero (until then: labeled
  placeholders)
- Real FAQ questions, or FAQ stays out
- Wording confirmation: does WhatsApp booking include pickup from halls, or
  drop-off at the shop? Copy must say what is true.
