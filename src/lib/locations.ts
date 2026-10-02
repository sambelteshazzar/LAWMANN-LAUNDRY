/**
 * The real operational locations from the proposal: the Lawmann Store plus
 * the campus halls and hostels where students live. Seeding and bootstrap
 * both write this list; the public site shows the student-facing subset as
 * AREAS in src/lib/site.ts.
 */

export const LOCATIONS: Array<[string, 'campus' | 'store']> = [
  ['Lawmann Store', 'store'],
  ['Evandy', 'campus'],
  ['International Student Hostel', 'campus'],
  ['Pentagon (Blocks A & B)', 'campus'],
  ['Vikings', 'campus'],
  ['Bani', 'campus'],
  ['TF Hostel', 'campus'],
  ['Aseda Annex A', 'campus'],
  ['Valco', 'campus'],
  ['Dr. Hilla Limann', 'campus'],
  ['Kwapong', 'campus'],
  ['Elizabeth Sey', 'campus'],
  ['Jean Nelson Aka', 'campus'],
  ['Legon Hall', 'campus'],
  ['Mensah Sarbah', 'campus'],
  ['Akuafo', 'campus'],
  ['Volta', 'campus'],
  ['Commonwealth', 'campus'],
];
