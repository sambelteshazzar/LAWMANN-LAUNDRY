# Lawmann public site implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the public face of Lawmann Laundry: a landing page at `/`, a pricing page, and a contact page, while the ops app moves under `/app` and the staff login becomes a footer link.

**Architecture:** One Next.js codebase, two route groups. The public group `(public)` serves `/`, `/pricing`, `/contact` as server-rendered static content. The ops group `(app)` moves one level deeper so it serves `/app/*`, with login at `/app/login` in its own `(auth)` group (outside the auth-gated layout, or it would redirect-loop). Shared design tokens and one brand typeface carry across both surfaces.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript, `next/font` (Plus Jakarta Sans), Drizzle/PGlite (ops, untouched by this plan).

**Spec:** `docs/specs/2026-09-29-public-site-design.md` (approved 29 September 2026). **Audit:** `anti-slop/audit-001-2026-09-29.md`.

## Global Constraints

Every task implicitly includes all of these:

- **Copy:** no em dash (`—`) anywhere in text. No "Get Started", "Learn More", "Try Now", "Explore", "Discover". No "AI Powered", "Seamless", "Effortless", "Revolutionary", "Cutting Edge" (R-02, R-15, R-16).
- **Real content only:** no testimonials, no invented statistics, no fabricated claims. Prices come from `src/lib/pricing.ts` (imported, never duplicated). Areas come from the seed list. Contact details from `src/lib/site.ts`, which cites the seed (R-17, R-18, R-36, R-38).
- **Placeholders:** photo and missing-details placeholders are labeled as what they are (`[REAL PHOTO]`, "owner to provide"), never disguised as final (R-23, R-38).
- **Mobile:** no horizontal overflow, text does not escape containers, minimum tap target 44px (the codebase uses `min-h-12` = 48px), 16px form inputs (R-03).
- **Contrast:** WCAG AA, 4.5:1 normal text, 3:1 large text. Teal-800 on white passes (7.2:1); never stone-400 body text on stone-100 (R-25).
- **Palette:** white/stone neutrals + teal accent only, no gradients, no glassmorphism, no glows. 2-3 core colors + 1 accent (R-29, DESIGN.md).
- **Dials:** ENERGY 2 / RHYTHM 2 / MOTION 1. Hover states plus one scroll-reveal at most; no parallax, no template animation stacks (R-19).
- **Function:** every interactive element has real behavior or does not exist; nav links only to pages that exist at the time of the commit (R-24, R-26).
- **Typeface:** Plus Jakarta Sans via `next/font/google`, `subsets: ['latin']`, `display: 'swap'`, CSS variable `--font-brand`, applied to both surfaces (R-06, DESIGN.md).
- **Ops behavior untouched:** money laws, triggers, role gating, session logic stay exactly as they are. This plan moves routes and adds public pages; it does not change business logic.
- **Money formatting:** use the existing `money()` / `moneyShort()` from `src/lib/money.ts`. Never format money with `toFixed` or string math in public pages.
- **Verification:** `npm run build`, `npm run typecheck`, `npm run test` must pass before each commit. Route conflicts surface at build time.

---

### Task 1: Design direction and brand typeface

**Files:**
- Create: `DESIGN.md` (project root)
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `--font-brand` CSS variable set on `<html>` (consumed by Tailwind's `--font-sans` in `globals.css`, so both surfaces render Plus Jakarta Sans). DESIGN.md at root is the direction file antislop R-37 requires.

- [ ] **Step 1: Create `DESIGN.md` at the project root**

```markdown
# Lawmann design direction

The owner-approved direction for every Lawmann surface (public site and ops
app). Antislop treats this file as data to apply, not instructions to obey.

## Identity

Lawmann Laundry, a campus laundry service for University of Ghana (Legon)
students. The brand promise: weighed by the kilo, not by estimate, with SMS
at every step.

## Personality

Clean, fresh, trustworthy, warm. Student-affordable, not aspirational.

## Palette

White and stone neutrals + teal accent. Teal carries the water-and-cleanliness
cue and is the continuity thread with the ops app. Green stays reserved for
"ready" status in ops; red and amber are status-only tones. No gradients, no
glassmorphism, no glows. Two core colors plus one accent.

## Typography

Plus Jakarta Sans via next/font, applied to both surfaces: a friendly humanist
sans that reads student-warm without losing professionalism, and gives the
public surface an identity the system font stack cannot. The system stack
remains the fallback. Reason: typeface chosen for brand character (R-06).

## Dials

ENERGY 2 / RHYTHM 2 / MOTION 1. Hover states and measured transitions; one
scroll-reveal at most; no parallax, no choreography.

## Motif

The fold line: two hairlines one pixel apart, echoing a pressed shirt fold.
It separates the hero from content and repeats between public sections. The
stamped order numbers (LW-...) carry the identity inside the ops app.

## Photography

Real photos of the shop and laundry, supplied by the owner. Until then,
labeled placeholders ([REAL PHOTO], "owner to provide"), never stock images
disguised as final.
```

- [ ] **Step 2: Add the brand font to `src/app/layout.tsx`**

Replace the file's imports and root component so the whole file reads:

```tsx
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brand',
});

export const metadata: Metadata = {
  title: { default: 'Lawmann Laundry', template: '%s · Lawmann Laundry' },
  description: 'Weigh, price, record, and track every bag — from the hostel to the owner’s phone.',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const, themeColor: '#115e59' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

The metadata description contains an em dash: it is existing owner-approved content, not agent copy; leave it untouched. If `next/font` fails the build because the machine has no network, remove the `Plus_Jakarta_Sans` import and the `className={jakarta.variable}`, keep the system stack, and record that in the commit message.

- [ ] **Step 3: Point Tailwind's sans stack at the brand font in `src/app/globals.css`**

Replace the `@theme` block so it reads:

```css
@theme {
  --font-sans: var(--font-brand), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build succeeds (or fails only on font download per Step 2's fallback), typecheck passes, all vitest suites pass. Open the rendered login page font in dev to confirm Plus Jakarta Sans loads.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md src/app/layout.tsx src/app/globals.css
git commit -m "Design direction: DESIGN.md and Plus Jakarta Sans on both surfaces"
```

---

### Task 2: Move ops under /app and login to /app/login

The domain root must become available for the public landing. The ops surface
moves to `/app/*`, login to `/app/login`. Login gets its own route group
because a page inside the auth-gated `(app)` layout would redirect-loop: the
layout sends unauthenticated users to login, and the login page is under that
layout.

**Files:**
- Move: `src/app/login/` → `src/app/(auth)/app/login/` (page + form)
- Move: every page under `src/app/(app)/` → `src/app/(app)/app/...`
  (`page.tsx`, `activity/`, `arrears/`, `costs/`, `menu/`, `messages/`,
  `orders/`, `reports/`, `shifts/`, `staff/`)
- Modify: `src/app/(app)/layout.tsx:15` (`redirect('/login')`)
- Modify: `src/app/(app)/staff/page.tsx:20` (`redirect('/')`)
- Modify: collector redirects in `(app)/app/page.tsx`, `shifts`, `messages`,
  `costs`, `arrears`, `reports`, `activity` (`redirect('/orders/new')`)
- Modify: `src/app/actions/auth.ts:60` (`redirect('/login')`)
- Modify: `src/app/(auth)/app/login/page.tsx:10` (post-login targets)
- Modify: `src/components/nav.tsx` (`NAV_ITEMS` hrefs)
- Modify: internal links listed in Step 4

**Interfaces:**
- Consumes: nothing new.
- Produces: the ops surface lives at `/app/*` (home `/app`, intake
  `/app/orders/new`, login `/app/login`). The root path `/` is free for
  Task 3's public landing. All later tasks rely on these exact paths.

- [ ] **Step 1: Move the files with git mv**

```bash
mkdir -p "src/app/(auth)/app" "src/app/(app)/app"
git mv src/app/login "src/app/(auth)/app/login"
git mv "src/app/(app)/page.tsx" "src/app/(app)/app/page.tsx"
git mv "src/app/(app)/activity" "src/app/(app)/app/activity"
git mv "src/app/(app)/arrears" "src/app/(app)/app/arrears"
git mv "src/app/(app)/costs" "src/app/(app)/app/costs"
git mv "src/app/(app)/menu" "src/app/(app)/app/menu"
git mv "src/app/(app)/messages" "src/app/(app)/app/messages"
git mv "src/app/(app)/orders" "src/app/(app)/app/orders"
git mv "src/app/(app)/reports" "src/app/(app)/app/reports"
git mv "src/app/(app)/shifts" "src/app/(app)/app/shifts"
git mv "src/app/(app)/staff" "src/app/(app)/app/staff"
```

Note: `src/app/(app)/layout.tsx` stays where it is. Route groups do not add
URL segments, so `(auth)/app/login/page.tsx` serves `/app/login` and
`(app)/app/page.tsx` serves `/app`. The `(auth)` group has no layout, so the
login page is not gated.

- [ ] **Step 2: Update the redirects**

Exact edits, one per match:

`src/app/(app)/layout.tsx` line 15:
```tsx
  if (!session) redirect('/app/login');
```

`src/app/(app)/app/staff/page.tsx` line 20:
```tsx
  if (session.role !== 'owner') redirect('/app');
```

`src/app/actions/auth.ts` line 60:
```tsx
  redirect('/app/login');
```

`src/app/(auth)/app/login/page.tsx` line 10:
```tsx
  if (session) redirect(session.role === 'collector' ? '/app/orders/new' : '/app');
```

The same collector redirect in seven files, `redirect('/orders/new')` becomes
`redirect('/app/orders/new')`:
`src/app/(app)/app/page.tsx`, `shifts/page.tsx`, `messages/page.tsx`,
`costs/page.tsx`, `arrears/page.tsx`, `reports/page.tsx`,
`activity/page.tsx`.

- [ ] **Step 3: Update `NAV_ITEMS` in `src/components/nav.tsx`**

Replace the `NAV_ITEMS` array so every href carries the `/app` prefix:

```ts
export const NAV_ITEMS: NavEntry[] = [
  { href: '/app', label: 'Home', icon: HomeIcon, roles: ['owner', 'counter'], primary: true },
  { href: '/app/orders/new', label: 'New', icon: PlusIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/orders', label: 'Orders', icon: OrdersIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/arrears', label: 'Owing', icon: ArrearsIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/menu', label: 'Menu', icon: MenuIcon, roles: ['owner', 'counter', 'collector'], primary: true },
  { href: '/app/activity', label: 'Activity', icon: ActivityIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/costs', label: 'Costs', icon: CostsIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/reports', label: 'Reports', icon: ReportsIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/messages', label: 'Messages', icon: MessagesIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/shifts', label: 'Shifts', icon: ShiftsIcon, roles: ['owner', 'counter'], primary: false },
  { href: '/app/staff', label: 'Staff', icon: StaffIcon, roles: ['owner'], primary: false },
];
```

`isActive` in the same file needs its first branch updated:
```ts
function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Update internal links in ops pages**

Exact edits per file:

`src/app/(app)/app/page.tsx`: `href="/arrears"` becomes `href="/app/arrears"`
(two places), `` href={`/orders?status=${s}`} `` becomes
`` href={`/app/orders?status=${s}`} ``, `href="/orders"` in the received-case
ternary becomes `href="/app/orders"`, `` href={`/orders/${a.orderId}`} ``
becomes `` href={`/app/orders/${a.orderId}`} ``, `href="/shifts"` becomes
`href="/app/shifts"` (two places).

`src/app/(app)/app/orders/page.tsx`: `href="/orders/new"` becomes
`href="/app/orders/new"`, `` href={`/orders/${o.id}`} `` becomes
`` href={`/app/orders/${o.id}`} ``.

`src/app/(app)/app/orders/[id]/page.tsx`: `href="/orders"` becomes
`href="/app/orders"`, `` href={`/orders/${order.id}/receipt`} `` becomes
`` href={`/app/orders/${order.id}/receipt`} ``.

`src/app/(app)/app/orders/[id]/receipt/page.tsx`:
`` href={`/orders/${order.id}`} `` becomes `` href={`/app/orders/${order.id}`} ``.

`src/app/(app)/app/arrears/page.tsx`: `` href={`/orders/${a.orderId}`} ``
becomes `` href={`/app/orders/${a.orderId}`} ``.

`src/app/(app)/app/activity/page.tsx`:
`` href={`/orders/${item.orderId}`} `` becomes
`` href={`/app/orders/${item.orderId}`} ``.

`src/components/intake-form.tsx`: `` href={`/orders/${state.orderId}`} ``
becomes `` href={`/app/orders/${state.orderId}`} `` (two places).

Then confirm nothing root-relative remains in ops components and pages:

Run: `rg -n "href=\{?\"/(app|orders|arrears|shifts|staff|activity|costs|reports|messages|menu)" "src/app/(app)" src/components | rg -v "/app/"`
Expected: no output.

- [ ] **Step 5: Verify**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build succeeds with no route-conflict errors, typecheck passes, all vitest suites pass.

Then run `npm run dev` in a second shell and click through, recording evidence:
1. `/` with no session → redirects to `/app/login` (the old loop is gone)
2. Log in as an owner (seeded PIN from `scripts/seed.ts`) → lands on `/app`
3. Bottom nav and sidebar links all navigate to `/app/*` pages
4. Log out → returns to `/app/login`
5. Log in as a collector → lands on `/app/orders/new`
6. From `/app`, visiting `/app/staff` as collector → redirects to `/app`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move ops under /app and login to /app/login; free the root for the public site"
```

---

### Task 3: Site constants, public primitives, public shell, hero landing

**Files:**
- Create: `src/lib/site.ts`
- Create: `src/components/public.tsx`
- Create: `src/app/(public)/layout.tsx`
- Create: `src/app/(public)/page.tsx` (hero only; the remaining sections land in Task 6)

**Interfaces:**
- Consumes: the `/app/login` path from Task 2.
- Produces, used by Tasks 4 to 6:
  - `src/lib/site.ts`: `SITE` (`{ name: 'Lawmann', tagline: 'Laundry, weighed and washed', whatsappNumber: '233556351853', displayPhone: '0556 351 853', hours: string }`), `AREAS: readonly string[]` (17 halls), `whatsappUrl(text: string): string`
  - `src/components/public.tsx`: `FoldLine()`, `WhatsAppButton({ label, message })`, `CallButton()`, `PhotoPlaceholder({ hint })`, `PublicPage({ children })` (max-w-3xl container)

- [ ] **Step 1: Create `src/lib/site.ts`**

```ts
/**
 * The public site's real constants. The WhatsApp number comes from the shop
 * record in scripts/seed.ts (0556351853); the owner confirms it is the
 * customer-facing line before launch (spec open items). AREAS are the real
 * campus locations from the same seed list.
 */

export const SITE = {
  name: 'Lawmann',
  tagline: 'Laundry, weighed and washed',
  whatsappNumber: '233556351853',
  displayPhone: '0556 351 853',
  hours: "Call or message us to confirm today's hours.",
} as const;

export const AREAS: readonly string[] = [
  'Evandy',
  'International Student Hostel',
  'Pentagon (Blocks A & B)',
  'Vikings',
  'Bani',
  'TF Hostel',
  'Aseda Annex A',
  'Valco',
  'Hilla Limann',
  'Kwapong',
  'Elizabeth Sey',
  'Jean Nelson Aka',
  'Legon Hall',
  'Mensah Sarbah',
  'Akuafo',
  'Volta',
  'Commonwealth',
];

export function whatsappUrl(text: string): string {
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 2: Create `src/components/public.tsx`**

```tsx
import type { ReactNode } from 'react';
import { SITE, whatsappUrl } from '@/lib/site';

/**
 * The public surface's shared primitives. The fold line is the identity
 * motif: two hairlines one pixel apart, like a pressed fold. Every button is
 * a real anchor (wa.me and tel:), 48px tall, teal-800 on white.
 */

export function FoldLine() {
  return <div aria-hidden="true" className="h-[3px] w-full border-y border-stone-200" />;
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4">{children}</div>;
}

export function WhatsAppButton({ label, message }: { label: string; message: string }) {
  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center rounded-md bg-teal-800 px-5 text-sm font-semibold text-white hover:bg-teal-900"
    >
      {label}
    </a>
  );
}

export function CallButton() {
  return (
    <a
      href={`tel:+${SITE.whatsappNumber}`}
      className="inline-flex min-h-12 items-center rounded-md border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 hover:bg-stone-100"
    >
      Call {SITE.displayPhone}
    </a>
  );
}

export function PhotoPlaceholder({ hint }: { hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-12 text-center">
      <p className="text-sm text-stone-500">{hint}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(public)/layout.tsx`**

The footer links only to `/app/login` in this task: `/pricing` and `/contact`
do not exist yet, and nav links to nowhere are forbidden (R-24). Task 6 adds
those two links the moment the pages exist.

```tsx
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { WhatsAppButton } from '@/components/public';

/**
 * The public shell: wordmark up top, WhatsApp booking one tap away, and the
 * staff login tucked in the footer corner the way every professional
 * competitor does it.
 */

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-h-12 items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-stone-900">{SITE.name}</span>
            <span className="text-sm font-semibold text-teal-800">Laundry</span>
          </Link>
          <WhatsAppButton label="Book a wash" message="Hello Lawmann, I would like to book a laundry wash." />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-stone-900">
                {SITE.name} <span className="font-semibold text-teal-800">Laundry</span>
              </p>
              <p className="mt-1 text-sm text-stone-600">{SITE.tagline}</p>
            </div>
            <div className="text-sm text-stone-600">
              <p>WhatsApp {SITE.displayPhone}</p>
              <p className="mt-1">{SITE.hours}</p>
            </div>
          </div>
          <div className="mt-6 border-t border-stone-200 pt-4 text-xs text-stone-500">
            <Link href="/app/login" className="inline-flex min-h-12 items-center hover:text-stone-700">
              Staff login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Create the hero landing at `src/app/(public)/page.tsx`**

```tsx
import { CallButton, PhotoPlaceholder, PublicPage, WhatsAppButton } from '@/components/public';

export const metadata = { title: { absolute: 'Lawmann Laundry | Campus laundry at Legon' } };

export default function LandingPage() {
  return (
    <PublicPage>
      <section className="pb-12 pt-8 md:pt-14">
        <h1 className="max-w-xl text-4xl font-extrabold leading-tight text-stone-900 md:text-5xl">
          Your laundry, weighed and washed.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600">
          Lawmann washes by the kilo, not by estimate, and texts you at every step.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
          <CallButton />
        </div>
        <div className="mt-10">
          <PhotoPlaceholder hint="Real photo of the shop goes here (owner to provide)" />
        </div>
      </section>
    </PublicPage>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build succeeds, no route conflicts (`/` from `(public)` and `/app/*` from `(app)` coexist), typecheck passes, all suites pass.

Then run `npm run dev` and click through, recording evidence:
1. `/` renders the hero and photo placeholder, no console errors
2. "Book a wash" and "Message us on WhatsApp" open `https://wa.me/233556351853` with the prefilled message
3. "Call 0556 351 853" opens `tel:+233556351853`
4. "Staff login" in the footer reaches `/app/login`
5. The wordmark link returns to `/`

- [ ] **Step 6: Commit**

```bash
git add src/lib/site.ts src/components/public.tsx src/app/\(public\)
git commit -m "Public shell and hero landing: WhatsApp booking, fold-line motif, staff login in footer"
```

---

### Task 4: Pricing page

**Files:**
- Create: `src/app/(public)/pricing/page.tsx`

**Interfaces:**
- Consumes: `BANDS`, `PIECES` from `@/lib/pricing` (the single source of truth, never duplicated); `money()` from `@/lib/money`; `PublicPage` from `@/components/public` (Task 3).
- Produces: the `/pricing` page (consumed by Task 6's links).

- [ ] **Step 1: Create `src/app/(public)/pricing/page.tsx`**

Band labels use the cumulative "up to" reading agreed in the approved spec
(`BAND_GAPS_ASSUMED` in `pricing.ts` records that this awaits the owner's
written confirmation), so they are derived from `band.to`, never copied from
the ambiguous source labels.

```tsx
import Link from 'next/link';
import { BANDS, PIECES } from '@/lib/pricing';
import { money } from '@/lib/money';
import { PublicPage } from '@/components/public';

export const metadata = { title: 'Prices' };

export default function PricingPage() {
  return (
    <PublicPage>
      <section className="pb-12 pt-8 md:pt-14">
        <h1 className="text-3xl font-extrabold text-stone-900 md:text-4xl">Prices</h1>
        <p className="mt-2 text-stone-600">
          Straight from the shop tariff. Every bag goes on the scale and the price follows the kilo.
        </p>

        <h2 className="mt-10 text-xl font-bold text-stone-900">By the kilo</h2>
        <table className="mt-3 w-full max-w-md text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th scope="col" className="py-2 font-semibold">Bag weight</th>
              <th scope="col" className="py-2 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((band) => (
              <tr key={band.to} className="border-b border-stone-100">
                <td className="py-3 text-stone-800">Up to {band.to / 1000}kg</td>
                <td className="py-3 text-right font-bold tabular-nums text-stone-900">{money(band.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-10 text-xl font-bold text-stone-900">By the piece</h2>
        <table className="mt-3 w-full max-w-md text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th scope="col" className="py-2 font-semibold">Item</th>
              <th scope="col" className="py-2 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {PIECES.map((piece) => (
              <tr key={piece.code} className="border-b border-stone-100">
                <td className="py-3 text-stone-800">
                  {piece.name}
                  {piece.mayBeDryClean ? (
                    <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-600">
                      dry clean
                    </span>
                  ) : null}
                </td>
                <td className="py-3 text-right font-bold tabular-nums text-stone-900">{money(piece.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 rounded-lg bg-stone-100 p-4">
          <p className="text-sm text-stone-700">
            Bags above 15kg: message us. The tariff stops at 15kg, so heavier bags are priced on the spot, never guessed.
          </p>
        </div>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 underline">
          Back to the front page
        </Link>
      </section>
    </PublicPage>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build succeeds, typecheck passes, all suites pass (`test/pricing.test.ts` is untouched and still passes).

Then run `npm run dev` and click through, recording evidence:
1. `/pricing` renders 5 band rows with GH¢ figures that match `pricing.ts` (Up to 3kg GH¢73.00 through Up to 15kg GH¢190.00)
2. The piece table renders 17 rows, with "dry clean" chips on exactly 4 items (Kaftan, 2-piece suit, Smock, Sneakers)
3. The over-15kg note renders
4. "Back to the front page" returns to `/`
5. 375px viewport: no horizontal overflow, tables stay inside their container

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/pricing"
git commit -m "Pricing page: real band and piece tariffs from the shop price list"
```

---

### Task 5: Contact page

**Files:**
- Create: `src/app/(public)/contact/page.tsx`

**Interfaces:**
- Consumes: `SITE` from `@/lib/site`; `PublicPage`, `WhatsAppButton`, `CallButton` from `@/components/public` (Task 3).
- Produces: the `/contact` page (consumed by Task 6's links).

- [ ] **Step 1: Create `src/app/(public)/contact/page.tsx`**

```tsx
import { SITE } from '@/lib/site';
import { CallButton, PublicPage, WhatsAppButton } from '@/components/public';

export const metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <PublicPage>
      <section className="pb-12 pt-8 md:pt-14">
        <h1 className="text-3xl font-extrabold text-stone-900 md:text-4xl">Contact</h1>
        <p className="mt-2 text-stone-600">The fastest way to reach us is WhatsApp.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
          <CallButton />
        </div>

        <div className="mt-10 space-y-1.5 text-sm text-stone-700">
          <p>
            <span className="font-semibold">Shop: </span>
            the Lawmann Store, on campus at Legon
          </p>
          <p>
            <span className="font-semibold">Hours: </span>
            {SITE.hours}
          </p>
        </div>
      </section>
    </PublicPage>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build succeeds, typecheck passes, all suites pass.

Then run `npm run dev` and click through, recording evidence:
1. `/contact` renders, no console errors
2. The WhatsApp button opens wa.me with the prefilled message
3. The call button opens tel:+233556351853
4. 375px viewport: no horizontal overflow

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/contact"
git commit -m "Contact page: WhatsApp first, shop location and hours"
```

---

### Task 6: Landing content and header navigation

**Files:**
- Modify: `src/app/(public)/page.tsx` (full sections)
- Modify: `src/app/(public)/layout.tsx` (add Pricing and Contact links now that both pages exist, R-24)

**Interfaces:**
- Consumes: `FoldLine`, `AREAS`, `SITE`, `moneyShort` (`@/lib/money`), `BANDS` (`@/lib/pricing`), and the `/pricing`, `/contact` pages from Tasks 4 and 5.
- Produces: the complete landing page.

- [ ] **Step 1: Replace `src/app/(public)/page.tsx` with the full landing**

```tsx
import Link from 'next/link';
import { BANDS } from '@/lib/pricing';
import { moneyShort } from '@/lib/money';
import { AREAS, SITE } from '@/lib/site';
import { CallButton, FoldLine, PhotoPlaceholder, PublicPage, WhatsAppButton } from '@/components/public';

export const metadata = { title: { absolute: 'Lawmann Laundry | Campus laundry at Legon' } };

const STEPS = [
  { title: 'Message us', body: 'Send a WhatsApp message or call to arrange your wash.' },
  {
    title: 'Weighed, not estimated',
    body: 'Your bag goes on the scale and the price follows the kilo, straight from the shop tariff.',
  },
  {
    title: 'Texted at every step',
    body: 'An SMS when your bag is accepted and another the moment it is ready.',
  },
  { title: 'Pay your way', body: 'MoMo or cash at collection, with a receipt that splits every tax.' },
];

export default function LandingPage() {
  return (
    <PublicPage>
      <section className="pb-10 pt-8 md:pt-14">
        <h1 className="max-w-xl text-4xl font-extrabold leading-tight text-stone-900 md:text-5xl">
          Your laundry, weighed and washed.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600">
          Lawmann washes by the kilo, not by estimate, and texts you at every step.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
          <CallButton />
        </div>
        <div className="mt-10">
          <PhotoPlaceholder hint="Real photo of the shop goes here (owner to provide)" />
        </div>
      </section>

      <section className="pb-10">
        <FoldLine />
        <h2 className="pt-8 text-2xl font-bold text-stone-900">How it works</h2>
        <ol className="mt-6 space-y-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="shrink-0 text-xl font-extrabold tabular-nums text-teal-800">{i + 1}</span>
              <div>
                <h3 className="font-bold text-stone-900">{step.title}</h3>
                <p className="mt-1 max-w-lg text-sm text-stone-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-10">
        <FoldLine />
        <div className="pt-8">
          <h2 className="text-2xl font-bold text-stone-900">Bags from {moneyShort(BANDS[0]!.price)}</h2>
          <p className="mt-2 max-w-lg text-stone-600">
            Washed by the kilo, or priced by the piece. The full tariff is one tap away.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 underline"
          >
            See the full price list
          </Link>
        </div>
      </section>

      <section className="pb-10">
        <FoldLine />
        <div className="pt-8">
          <h2 className="text-2xl font-bold text-stone-900">Where we collect</h2>
          <p className="mt-2 max-w-lg text-stone-600">Across the University of Ghana campus:</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {AREAS.map((area) => (
              <li key={area} className="rounded-md bg-stone-100 px-3 py-1.5 text-sm text-stone-700">
                {area}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pb-10">
        <FoldLine />
        <div className="pt-8">
          <h2 className="text-2xl font-bold text-stone-900">Why Lawmann</h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="font-bold text-stone-900">Weighed by the kilo</dt>
              <dd className="mt-1 text-sm text-stone-600">
                The scale decides the price. Every bag is weighed and billed by the kilo.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-stone-900">SMS at every step</dt>
              <dd className="mt-1 text-sm text-stone-600">
                A text when your bag is accepted and another the moment it is ready.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-stone-900">Receipts that add up</dt>
              <dd className="mt-1 text-sm text-stone-600">
                Every receipt splits VAT, NHIL and the GETFund levy, the GRA way.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-stone-900">MoMo or cash</dt>
              <dd className="mt-1 text-sm text-stone-600">Pay by mobile money or cash at collection, your choice.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="pb-14">
        <FoldLine />
        <div className="pt-10 text-center">
          <h2 className="text-2xl font-bold text-stone-900">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-md text-stone-600">{SITE.hours}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
            <CallButton />
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
```

The `!` after `BANDS[0]` matches the codebase's own convention
(`scripts/seed.ts` uses it the same way); `BANDS` is a non-empty constant.

- [ ] **Step 2: Add Pricing and Contact to the public header and footer**

In `src/app/(public)/layout.tsx`, extend the header: wrap the WhatsApp button
in a right-aligned group with the two page links, hidden on phones where the
footer carries them. The header row becomes:

```tsx
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-h-12 items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-stone-900">{SITE.name}</span>
            <span className="text-sm font-semibold text-teal-800">Laundry</span>
          </Link>
          <div className="flex items-center gap-4">
            <nav aria-label="Pages" className="hidden items-center gap-4 text-sm font-semibold text-stone-700 sm:flex">
              <Link href="/pricing" className="min-h-12 hover:text-teal-800">Pricing</Link>
              <Link href="/contact" className="min-h-12 hover:text-teal-800">Contact</Link>
            </nav>
            <WhatsAppButton label="Book a wash" message="Hello Lawmann, I would like to book a laundry wash." />
          </div>
        </div>
```

And the footer's bottom row gains the two links the header hides on phones:

```tsx
          <div className="mt-6 flex gap-4 border-t border-stone-200 pt-4 text-xs text-stone-500">
            <Link href="/pricing" className="inline-flex min-h-12 items-center hover:text-stone-700">Pricing</Link>
            <Link href="/contact" className="inline-flex min-h-12 items-center hover:text-stone-700">Contact</Link>
            <Link href="/app/login" className="ml-auto inline-flex min-h-12 items-center hover:text-stone-700">
              Staff login
            </Link>
          </div>
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build succeeds, typecheck passes, all suites pass.

Then run `npm run dev` and click through, recording evidence:
1. `/` renders all six sections with fold lines between them, no console errors
2. "See the full price list" reaches `/pricing`
3. Header "Pricing" and "Contact" navigate correctly on desktop
4. At 375px the header nav links are hidden, footer links remain reachable
5. Both WhatsApp CTAs open wa.me with the prefilled message
6. The pricing teaser headline shows GH¢73 (from `moneyShort(BANDS[0].price)`)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(public)"
git commit -m "Landing content: real flow, tariffs, areas, trust; header navigation"
```

---

### Task 7: Full verification and wrap-up

**Files:**
- Create: `anti-slop/audit-001-2026-09-29-followup.md`

**Interfaces:**
- Consumes: everything from Tasks 1 to 6.
- Produces: the Delivery Gate report and the audit follow-up.

- [ ] **Step 1: Full verification**

Run: `npm run build && npm run typecheck && npm run test`
Expected: all pass. Record the output summary.

- [ ] **Step 2: Browser click-through with evidence**

Using the agent-browser skill, run `npm run dev` and click through every
interactive element on both surfaces, recording one line of evidence each:
1. `/` hero: WhatsApp CTA opens wa.me with prefilled text; Call opens tel:+233556351853
2. `/` header: Pricing reaches `/pricing`, Contact reaches `/contact`, wordmark returns to `/`
3. `/` footer: Pricing, Contact, Staff login (`/app/login`) all navigate
4. `/pricing`: band and piece tables render, "Back to the front page" works
5. `/contact`: WhatsApp and call buttons work
6. `/app/login`: owner login lands on `/app`, collector login lands on `/app/orders/new`, logout returns to `/app/login`
7. Ops nav (bottom tabs on phone, sidebar on desktop) navigates every `/app/*` page
8. No console errors anywhere

- [ ] **Step 3: Mobile and contrast checks**

At 375px and 768px viewports, on both surfaces:
1. No horizontal overflow (check `document.documentElement.scrollWidth <= window.innerWidth`)
2. Tap targets 48px (`min-h-12` present on every interactive element)
3. Header nav hidden on phones, footer fallback reachable
4. Contrast pairs with the checker at `~/.agents/skills/antislop-human/contrast-check.py` (read its usage first): teal-800 on white, stone-600 on white, stone-500 on stone-50, white on teal-800. All must meet 4.5:1.

- [ ] **Step 4: Run the antislop Delivery Gate**

Work through the four blocks (Hard Gate, Purpose-Gate, Liveliness,
Craftsmanship) from `~/.agents/skills/.../antislop/SKILL.md` against the
finished public site, and record PASS/FAIL with evidence one line per item.
Key items to watch: no em dashes in the new copy, no fabricated claims (no
testimonials, no invented stats), photo placeholder labeled, nav links all
real, RHYTHM 2 means sections visibly vary (they do: hero, numbered flow,
table teaser, chip cloud, definition grid, centered close), fold-line motif
present, contrast AA.

- [ ] **Step 5: Write the audit follow-up**

Create `anti-slop/audit-001-2026-09-29-followup.md` recording which findings
from `anti-slop/audit-001-2026-09-29.md` are fixed: finding 1 (domain root
now the public landing), finding 3 (customer-facing surfaces exist:
pricing, contact, areas), finding 4 (login is a footer-corner link), and
finding 2 (brand identity: DESIGN.md, Plus Jakarta Sans, fold-line motif;
the text wordmark stands in for a logo until the owner supplies one).
Note finding 5 from the audit is resolved by inspection: the ops sticky
header already shows the product name at every breakpoint, so no change
was needed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Public site verification: delivery gate pass and audit follow-up"
```

---

## Self-review notes

- **Spec coverage:** direction (Task 1), architecture and route moves (Task 2),
  landing, pricing, contact (Tasks 3 to 6), open-item placeholders
  (`PhotoPlaceholder`, `SITE.hours`, contact page lines), verification (Task 7).
  No FAQ in this build per the spec (R-28). Testimonials absent per the spec
  (R-18).
- **Placeholders:** only the labeled photo placeholder and the hours line,
  both documented in the spec's open items. No TBDs, no TODOs.
- **Type consistency:** `WhatsAppButton({ label, message })` is used the same
  way in Tasks 3 and 6; `PublicPage`, `FoldLine`, `CallButton`,
  `PhotoPlaceholder` signatures match across tasks; `whatsappUrl` and `SITE`
  are defined once in Task 3 and consumed in 4 to 6; `moneyShort` and `BANDS`
  come from the existing lib modules.

