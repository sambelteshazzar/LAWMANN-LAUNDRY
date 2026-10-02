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
