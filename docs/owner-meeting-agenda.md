# Owner meeting agenda

Purpose: resolve every open question that changes what gets built, in one sitting.

Bring: this document, the owner proposal, a phone with the price poster photo on it, and
three or four real orders from the notebook or WhatsApp.

Rule for the meeting: **anything that changes a number goes in writing before the meeting
ends.** Verbal answers do not survive into the code.

---

## Tier 1 — changes the architecture. Do not start intake before these four are answered.

### 1. Are you limited by machines or by customers?

How many kilos of laundry can you get through in a full day, and what does a full week
look like?

Washing and drying are different constraints. Washing is water and time. Drying is gas and
time, and the dryer is normally the bottleneck. Find out which one runs out first.

Why it matters:

- If capacity runs out, the app needs a queue, honest promise dates, and a way to tell a
  student their bag cannot be taken today. That is real scheduling logic.
- If capacity does not run out, the app needs none of that, and the business problem is
  finding more students, which is a different problem entirely.

### 2. What does a normal bag weigh?

Ask for a rough split across the last few loads. Roughly how many bags land in 0–3kg, how
many in 4–6kg, and so on.

Why it matters: the whole margin analysis assumes the big bands matter. If most bags are
under 3kg then the 0–3kg band at GH¢73 is the business and the 10–12kg band is a footnote.

### 3. What happens to laundry over the long vacation?

The hostel has 960 beds. The vacation is roughly five or six weeks from mid-August to
early October. Students go home.

- Do you store laundry for people who go home?
- What about students who left with a balance owing?
- Is there a time limit after which you dispose of it?
- Do you tell students in advance?

Why it matters: this decides whether the app needs a dormancy state, an abandonment rule,
and a collections push before October, or whether the honest answer is to close for the
break and reopen.

### 4. Is drying billed or costed separately?

Is the customer charged one weight-based price, or is drying a separate line? What does a
heavy 12kg bag cost you in gas compared with a 3kg bag?

Why it matters: if gas scales badly with load weight, the 10–12kg band is worse than
GH¢10.67 per kilo suggests, because the cheapest per-kilo band is also the most
gas-expensive band to actually run.

---

## Tier 2 — needed for correct seed data. Cheap, but get them anyway.

### Tariff

- **The band gaps.** The poster reads 0–3, 4–6, 7–9, 10–12, 13–15. A bag of 3.5kg falls
  in no band. A bag of 6.5kg falls in no band. What do you actually charge today for a
  3.5kg bag? *Currently the system assumes the bands mean "up to 3, up to 6, up to 9, up
  to 12, up to 15", and prices a 3.5kg bag at GH¢93 on our authority rather than yours.
  This needs an explicit yes.*
- **Above 15kg.** There is no band. A student washing before exams will exceed it in the
  first week. What price?
- **Dry cleaning.** Is there a separate list? What do you charge? Are smock, kaftan and
  2-piece suit dry cleaned rather than washed, and is sneakers a separate treatment? The
  poster is one column with no distinction.
- **Duvet.** The poster says big/small, both at GH¢70. Is small less?
- **Minimum order.** The 0–3kg band at GH¢73 acts as a floor. Is that deliberate?
- **Band or piece?** When a student hands you a bag, do you price by weight or by counting
  items? When do you use which? *Currently the system defaults to weight and treats piece
  pricing as an override, and records which was used.*
- **When did you last set these prices?** The cedi has moved hard. If they were set in
  2024 they are badly stale and the whole margin picture is different.
- **Discounts.** Regulars, staff, friends, bundles. Does anyone get a rate?
- **Collection fee.** Included, or charged separately?

### Money

- **Cost per kilo, all in.** Gas, electricity, water, detergent, whoever washes and folds,
  fuel for the round, a share of the shop rent. *If there is no single number, give me
  weekly gas, weekly power, weekly detergent and weekly wages, plus kilos washed that week.
  I will do the dividing.*
- **Wages.** Does anyone help? Salary or per kilo?
- **Rent.** Is the shop rented, and do you pay anyone at the hostels?
- **Gas type.** LPG bottle, or mains gas, or electric dryers? This moves the cost per kilo
  a long way.

### Operations

- How many collectors, and how many hours in a day?
- Which days do you visit which hostel? Write it down as a fixed weekly round.
- The scale: do you carry one to the hostel or weigh at the store?
- Turnaround: how long from pickup to ready, in practice?
- Do you hand out a paper ticket today? If so what does it show?
- If a bag comes back short, what do you do today?

---

## Write down before leaving

- Cost per kilo, all in
- Band gap answer, in words
- Price above 15kg
- Dry cleaning rates, or confirmation there are none
- Duvet, small
- Two or three real orders: weight, price charged, amount paid

---

## Since the first build (added 28 September 2026)

The app now runs end to end on demo data. Three things need the owner before
the demonstration, and one decision needs making:

- **Arkesel account.** Register at arkesel.com, top up ~GH¢50, request the
  "Lawmann" sender ID, and hand over the API key. Until then the app records
  every message and shows exactly what each student would receive — nothing
  sends, nothing is faked.
- **Demo PINs.** Owner 1234, counter 2345, collector 3456. Change them at
  handover, on the Staff page.
- **SESSION_SECRET.** One long random string in the demo environment before
  the owner touches it.
- **Decision: what the demo runs on.** The demo database is embedded
  Postgres in a file. It is fast and needs no setup, but an unclean shutdown
  (power cut, killed process) can lose the day's entries — the notebook stays
  the backup for the first term regardless. The production path is the
  docker-compose Postgres in infra/, which commits durably. Decide before the
  demo date whether the demo runs on the file or the server database.

---

## Not for the meeting

Cost of building. Do not quote a number until scope is agreed. The proposal already
positions the free demonstration as the thing that closes this, so let the demonstration
do that work rather than a price slide.
