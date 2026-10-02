# Lawmann design direction

The owner-approved direction for Lawmann surfaces. Antislop treats this file
as data to apply, not instructions to obey.

## Identity

Lawmann Laundry, a campus laundry service for University of Ghana (Legon)
students. The brand promise: weighed by the kilo, not by estimate, with SMS
at every step.

## Personality

Clean, fresh, trustworthy, warm. Student-affordable, not aspirational.

## Public site: Botanical / Organic Serif

The marketing surface speaks botanical: soft, grounded, editorial.

- Palette: warm alabaster #F9F8F4 ground, deep forest #2D3A31 text, sage
  #8C9A84 accents, soft clay #DCCFC2/#F2F0EB fills, terracotta #C27B66
  interaction tones (terracotta-deep #A05A45 for text, terracotta for hover
  and borders). No artificial brights.
- Typography: Playfair Display for headlines (italic accents on key words),
  Source Sans 3 for body. Large, airy scale.
- Shapes: rounded-3xl cards, pill buttons, arch imagery (rounded-t-full).
  Thin 1.5px stroke icons in soft sage circles.
- Paper grain: the fixed SVG noise overlay at 0.015 opacity is mandatory on
  every public page. It is the difference between flat and tactile.
- Motion: slow and graceful. 300ms button hovers, 500ms card lifts, one
  700ms rise on the hero. Hover lifts cards and images scale; nothing snaps.
- Structure: eyebrow badge, matched-height CTA pairs, price anchor in the
  hero, trust bar under the hero, uppercase kickers above section headings,
  staggered card grids (md:even:translate-y-12).

## Ops app: the original working skin

- Palette: white and stone neutrals + teal accent. Teal carries the
  water-and-cleanliness cue. Green reserved for "ready" status in ops; red
  and amber are status-only tones. No gradients, no glassmorphism, no glows.
- Typography: Plus Jakarta Sans via next/font. Stamped order numbers
  (LW-...) carry the identity inside the app.

## Dials

Public: ENERGY 2 / RHYTHM 2 / MOTION 1. Ops: ENERGY 2 / RHYTHM 2 / MOTION 1.
Hover states and measured transitions; one load-in reveal on the public hero;
no parallax, no choreography.

## Motif

The fold line: two hairlines one pixel apart, echoing a pressed shirt fold.
On the public site it is drawn in stoneline; in the ops app it separates the
shell from content.

## Photography

The hero carries an illustrative stock photo (CC0 from StockSnap via
Openverse, public/images/hero-laundry.jpg) — legally free, no attribution
required. It stands in for the shop, never claims to be it: alt text stays
generic ("washing machines inside a working laundromat"). When the owner
supplies real photos of the Lawmann shop, swap the file at that path and
update the alt text; nothing else changes. No stock image may be captioned
or alt-texted as the actual shop.
