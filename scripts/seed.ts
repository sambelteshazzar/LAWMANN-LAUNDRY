/**
 * Seeds the demo database with the real business: the 17 hostels from the
 * proposal, the poster tariff, staff with PINs, six weeks of orders weighted
 * toward small bags, mixed payments (including pending MoMo and partials),
 * weekly costs, and an open shift.
 *
 * Deterministic (fixed RNG seed) with dates relative to today, so the demo
 * always shows a live shop. Truncates first: safe to re-run.
 *
 * Usage: npm run db:seed
 */

import { eq } from 'drizzle-orm';
import { getDb, ensureBooted, client } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { BANDS, bandFor } from '@/lib/pricing';
import { grams } from '@/lib/money';
import { splitTaxInclusive } from '@/lib/tax';
import { hashPin } from '@/lib/auth';
import { pathToFileURL } from 'node:url';
import { acceptedMessage, readyMessage } from '@/lib/sms/templates';
import { LOCATIONS } from '@/lib/locations';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}



const STUDENTS: Array<{ phone: string; name: string; room: string }> = [
  { phone: '0241234567', name: 'Ama Serwaa', room: 'TF Block C, Room 12' },
  { phone: '0542345678', name: 'Kwame Mensah', room: 'Legon Hall, Room 204' },
  { phone: '0553456789', name: 'Abena Osei', room: 'Volta Hall, Room 31' },
  { phone: '0594567890', name: 'Yaw Darko', room: 'Commonwealth, Room 118' },
  { phone: '0205678901', name: 'Efua Adu', room: 'Mensah Sarbah, Room 45' },
  { phone: '0506789012', name: 'Kojo Antwi', room: 'Akuafo, Room 77' },
  { phone: '0247890123', name: 'Adjoa Frimpong', room: 'Elizabeth Sey, Room 9' },
  { phone: '0548901234', name: 'Fiifi Boateng', room: 'Pentagon Block A, Room 302' },
  { phone: '0559012345', name: 'Esi Quarshie', room: 'Jean Nelson Aka, Room 56' },
  { phone: '0590123456', name: 'Papa Kwesi', room: 'Vikings, Room 21' },
  { phone: '0201234987', name: 'Maame Akosua', room: 'Kwapong, Room 63' },
  { phone: '0502345098', name: 'Nana Yaw', room: 'Dr. Hilla Limann, Room 88' },
];

const STAFF: Array<{ name: string; role: 'owner' | 'counter' | 'collector'; pin: string }> = [
  { name: 'Owner', role: 'owner', pin: '1234' },
  { name: 'Auntie Muni', role: 'counter', pin: '2345' },
  { name: 'Kofi', role: 'collector', pin: '3456' },
];

function pickWeight(rand: () => number): number {
  const r = rand();
  if (r < 0.5) return 1000 + Math.floor(rand() * 2000); // 1–3kg
  if (r < 0.8) return 3000 + Math.floor(rand() * 3000); // 3–6kg
  if (r < 0.92) return 6000 + Math.floor(rand() * 3000); // 6–9kg
  if (r < 0.97) return 9000 + Math.floor(rand() * 3000); // 9–12kg
  return 12000 + Math.floor(rand() * 3000); // 12–15kg
}

function at(day: Date, hour: number, minute = 0): Date {
  const d = new Date(day);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function orderNoFor(date: Date, n: number): string {
  const yy = String(date.getUTCFullYear()).slice(2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `LW-${yy}${mm}${dd}-${String(n).padStart(3, '0')}`;
}

async function main(): Promise<void> {
  if (process.env.DATABASE_URL) {
    throw new Error(
      'seed: DATABASE_URL is set. The demo seed truncates tables, so it must never run ' +
        'against a real database. Use npm run db:bootstrap for production.',
    );
  }
  await ensureBooted();
  const db = getDb();
  const rand = mulberry32(42);

  await client.exec(
    'TRUNCATE shift, operating_cost, sms_message, order_event, payment, orders, student, staff, location, shop, band RESTART IDENTITY CASCADE',
  );

  const [shop] = await db
    .insert(schema.shop)
    .values({ name: 'Lawmann Laundry Service', momoNumber: '0556351853' })
    .returning();
  if (!shop) throw new Error('seed: shop insert failed');

  const locations = new Map<string, string>();
  for (const [name, kind] of LOCATIONS) {
    const [loc] = await db.insert(schema.location).values({ shopId: shop.id, name, kind }).returning();
    if (!loc) throw new Error(`seed: location ${name} failed`);
    locations.set(name, loc.id);
  }

  await db.insert(schema.band).values(BANDS.map((b) => ({ toGrams: b.to, price: b.price, active: true })));

  const staffIds = new Map<string, string>();
  for (const s of STAFF) {
    const [row] = await db
      .insert(schema.staff)
      .values({ shopId: shop.id, name: s.name, role: s.role, pinHash: hashPin(s.pin) })
      .returning();
    if (!row) throw new Error(`seed: staff ${s.name} failed`);
    staffIds.set(s.name, row.id);
  }
  const collectorId = staffIds.get('Kofi')!;
  const counterId = staffIds.get('Auntie Muni')!;

  const studentIds = new Map<string, string>();
  for (const s of STUDENTS) {
    const [row] = await db
      .insert(schema.student)
      .values({ shopId: shop.id, phone: s.phone, name: s.name, room: s.room })
      .returning();
    if (!row) throw new Error(`seed: student ${s.name} failed`);
    studentIds.set(s.phone, row.id);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayCounters = new Map<string, number>();
  const hostelNames = LOCATIONS.filter(([, k]) => k === 'campus').map(([n]) => n);

  let orderCount = 0;
  let smsCount = 0;
  for (let daysAgo = 41; daysAgo >= 0; daysAgo -= 1) {
    const day = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    // Sundays are quiet; Saturdays and pre-exam Mondays are busy. One line, honest seasonality.
    const isSunday = day.getUTCDay() === 0;
    const bagsToday = isSunday ? (rand() < 0.3 ? 1 : 0) : 1 + Math.floor(rand() * 2);
    for (let b = 0; b < bagsToday; b += 1) {
      const weight = pickWeight(rand);
      const band = bandFor(grams(weight));
      if (!band) throw new Error(`seed: weight ${weight} has no band`);
      const student = STUDENTS[Math.floor(rand() * STUDENTS.length)]!;
      const hostel = hostelNames[Math.floor(rand() * hostelNames.length)]!;
      const created = at(day, 8 + Math.floor(rand() * 9), Math.floor(rand() * 60));
      const key = day.toISOString().slice(0, 10);
      const n = (dayCounters.get(key) ?? 0) + 1;
      dayCounters.set(key, n);

      const split = splitTaxInclusive(band.price);
      const recorder = rand() < 0.7 ? collectorId : counterId;
      const [order] = await db
        .insert(schema.orders)
        .values({
          id: crypto.randomUUID(),
          shopId: shop.id,
          orderNo: orderNoFor(day, n),
          locationId: locations.get(hostel)!,
          studentId: studentIds.get(student.phone)!,
          recordedBy: recorder,
          status: 'received',
          weightGrams: weight,
          method: 'band',
          gross: band.price,
          base: split.base,
          vat: split.vat,
          nhil: split.nhil,
          getfund: split.getfund,
          promisedAt: at(day, 17),
          createdAt: created,
        })
        .returning();
      if (!order) throw new Error('seed: order insert failed');
      orderCount += 1;

      // Status by age: old bags collected, recent ones mid-flow, two old ones still ready.
      let status: 'received' | 'washing' | 'ready' | 'collected' = 'received';
      if (daysAgo > 14) status = 'collected';
      else if (daysAgo > 7) status = rand() < 0.8 ? 'collected' : 'ready';
      else if (daysAgo > 3) status = (['washing', 'ready'] as const)[Math.floor(rand() * 2)]!;
      else status = (['received', 'washing', 'ready'] as const)[Math.floor(rand() * 3)]!;
      if (daysAgo === 9 || daysAgo === 12) status = 'ready'; // sitting too long

      const moves: Array<'washing' | 'ready' | 'collected'> = [];
      if (status !== 'received') moves.push('washing');
      if (status === 'ready' || status === 'collected') moves.push('ready');
      if (status === 'collected') moves.push('collected');
      let from: 'received' | 'washing' | 'ready' | 'collected' = 'received';
      for (const [i, to] of moves.entries()) {
        await db.insert(schema.orderEvent).values({
          orderId: order.id,
          fromStatus: from,
          toStatus: to,
          staffId: recorder,
          at: at(day, 10 + i * 5),
        });
        from = to;
      }
      await db
        .update(schema.orders)
        .set({
          status,
          readyAt: status === 'ready' || status === 'collected' ? at(day, 15) : null,
          collectedAt: status === 'collected' ? at(day, 17) : null,
        })
        .where(eq(schema.orders.id, order.id));

      // Payments: most full, some partial, some pending MoMo, some still owing.
      const roll = rand();
      const paidAt = at(day, 9);
      if (roll < 0.55) {
        await db.insert(schema.payment).values({ orderId: order.id, amount: band.price, method: 'cash', recordedBy: recorder, state: 'confirmed', paidAt });
      } else if (roll < 0.7) {
        await db.insert(schema.payment).values({ orderId: order.id, amount: band.price, method: 'momo', recordedBy: recorder, state: daysAgo > 2 ? 'confirmed' : 'pending_momo', gatewayRef: `MP${key.replaceAll('-', '')}.${1000 + Math.floor(rand() * 9000)}.A`, paidAt });
      } else if (roll < 0.82) {
        const half = Math.round(band.price / 2);
        await db.insert(schema.payment).values({ orderId: order.id, amount: half, method: 'cash', recordedBy: recorder, state: 'confirmed', paidAt });
        if (status === 'collected' || rand() < 0.5) {
          await db.insert(schema.payment).values({ orderId: order.id, amount: band.price - half, method: 'cash', recordedBy: counterId, state: 'confirmed', paidAt: at(day, 16) });
        }
      }
      // else: still owing — the arrears list needs residents.

      // Recent orders carry their messages so the outbox has something to show.
      if (daysAgo <= 2) {
        await db.insert(schema.smsMessage).values({
          shopId: shop.id,
          orderId: order.id,
          kind: 'accepted',
          toPhone: student.phone,
          body: acceptedMessage({ name: student.name, weightGrams: grams(weight), grossPesewa: band.price, paidAllStatesPesewa: 0, orderNo: order.orderNo }),
          state: 'queued',
          createdAt: created,
        });
        smsCount += 1;
        if (status === 'ready' || status === 'collected') {
          await db.insert(schema.smsMessage).values({
            shopId: shop.id,
            orderId: order.id,
            kind: 'ready',
            toPhone: student.phone,
            body: readyMessage(order.orderNo),
            state: 'queued',
            createdAt: at(day, 15),
          });
          smsCount += 1;
        }
      }
    }
  }

  // Six weeks of bills. Gas dominates; wages are weekly; rent is monthly.
  const weekly: Array<{ category: (typeof schema.costCategory.enumValues)[number]; label: string; amount: number }> = [
    { category: 'gas', label: 'Total filling station refill', amount: 8200 },
    { category: 'electricity', label: 'ECG prepaid', amount: 3500 },
    { category: 'water', label: 'GWL bill', amount: 1500 },
    { category: 'detergent', label: 'Omo + bleach', amount: 5200 },
    { category: 'wages', label: 'Kofi week', amount: 20000 },
    { category: 'transport', label: 'Fuel for the round', amount: 3000 },
  ];
  for (let w = 0; w < 6; w += 1) {
    const incurred = new Date(today.getTime() - w * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const c of weekly) {
      await db.insert(schema.operatingCost).values({ shopId: shop.id, category: c.category, label: c.label, amount: c.amount, incurredOn: incurred });
    }
  }
  await db.insert(schema.operatingCost).values({ shopId: shop.id, category: 'rent', label: 'Shop rent, September', amount: 15000, incurredOn: today.toISOString().slice(0, 10) });

  const shiftOpen = at(today, 8);
  await db.insert(schema.shift).values({ staffId: collectorId, openedAt: shiftOpen, float: 10000 });

  console.log(`Seeded: 1 shop, ${LOCATIONS.length} locations, 5 bands, 3 staff, ${STUDENTS.length} students, ${orderCount} orders, ${smsCount} queued SMS, 1 open shift.`);
  console.log('PINs — Owner: 1234, Auntie Muni: 2345, Kofi: 3456.');
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
