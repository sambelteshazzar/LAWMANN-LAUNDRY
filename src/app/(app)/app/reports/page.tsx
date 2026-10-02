import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { bandMix, costPerKilo, revenueInRange, taxSummary, type Range } from '@/lib/reports';
import { thinnestBand } from '@/lib/pricing';
import { moneyShort, weightLabel } from '@/lib/money';
import { EmptyState, Money, Page, PageTitle, Section, Stat, StatCard } from '@/components/ui';

export const metadata = { title: 'Reports · Lawmann Laundry' };

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'all', label: 'All time' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

function rangeFor(key: RangeKey, now: Date): { range: Range; label: string } {
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (key) {
    case 'today':
      return { range: { from: startOfDay, to: now }, label: 'today' };
    case 'week': {
      const back = (startOfDay.getUTCDay() + 6) % 7;
      return { range: { from: new Date(startOfDay.getTime() - back * 86400000), to: now }, label: 'this week' };
    }
    case 'lastmonth': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { range: { from: first, to: last }, label: 'last month' };
    }
    case 'all':
      return { range: { from: new Date('2020-01-01T00:00:00Z'), to: now }, label: 'all time' };
    case 'month':
    default:
      return { range: { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: now }, label: 'this month' };
  }
}

/**
 * What you actually made: revenue against costs, the real cost per kilo
 * against the thinnest band, which bands earn, and the levy figures for
 * the GRA return. Numbers first, then the verdict in words.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/app/orders/new');

  const params = await searchParams;
  const key: RangeKey = RANGES.some((r) => r.key === params.range) ? (params.range as RangeKey) : 'month';
  const now = new Date();
  const { range, label } = rangeFor(key, now);

  await ensureBooted();
  const db = getDb();
  const [revenue, kilo, mix, tax] = await Promise.all([
    revenueInRange(db, session.shopId, range),
    costPerKilo(db, session.shopId, range),
    bandMix(db, session.shopId, range),
    taxSummary(db, session.shopId, range),
  ]);
  const profit = revenue.confirmedPesewa - kilo.costPesewa;
  const thinnest = thinnestBand();

  const verdict =
    kilo.perKiloPesewa === null
      ? 'Nothing was washed in this period, so there is no cost per kilo to judge.'
      : kilo.perKiloPesewa < thinnest.perKg
        ? `Your cost per kilo is ${moneyShort(kilo.perKiloPesewa)}. Every band earns above that, including the thinnest, ${thinnest.band.label} at ${moneyShort(thinnest.perKg)} per kilo.`
        : `Your cost per kilo is ${moneyShort(kilo.perKiloPesewa)}, above the ${thinnest.band.label} band's ${moneyShort(thinnest.perKg)} per kilo. That band is losing money on every full bag.`;

  return (
    <Page>
      <PageTitle title="Reports" hint="What you made, not just what came in." />
      <div className="no-print mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Report ranges">
        {RANGES.map((r) => {
          const active = key === r.key;
          return (
            <Link
              key={r.key}
              role="tab"
              aria-selected={active}
              href={r.key === 'month' ? '/reports' : `/reports?range=${r.key}`}
              className={`flex min-h-12 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
                active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-inset ring-stone-200'
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={`Revenue ${label}`} value={<Money pesewas={revenue.confirmedPesewa} />} sub={`${revenue.confirmedCount} payments`} />
        <Stat
          label={`Made ${label}`}
          value={<Money pesewas={profit} />}
          sub={
            <>
              after <Money pesewas={kilo.costPesewa} short /> costs
            </>
          }
          tone={profit < 0 ? 'red' : 'default'}
        />
      </div>

      <Section title={`Cost per kilo ${label}`}>
        {kilo.perKiloPesewa === null ? (
          <p className="text-sm text-stone-600">{verdict}</p>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums">
              <Money pesewas={kilo.perKiloPesewa} short />
              <span className="text-base font-medium text-stone-500"> /kilo</span>
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {moneyShort(kilo.costPesewa)} across {weightLabel(kilo.kilosGrams)} washed
            </p>
          </>
        )}
        <p className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${kilo.perKiloPesewa !== null && kilo.perKiloPesewa >= thinnest.perKg ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}>
          {verdict}
        </p>
      </Section>

      <Section title={`Bands ${label}`}>
        {mix.length === 0 ? (
          <EmptyState title="No bags in this period." hint="Take a bag and this table starts knowing which bands earn." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="pb-2 pr-2 font-semibold">Band</th>
                  <th className="pb-2 pr-2 text-right font-semibold">Bags</th>
                  <th className="pb-2 pr-2 text-right font-semibold">Revenue</th>
                  <th className="pb-2 text-right font-semibold">Per kilo</th>
                </tr>
              </thead>
              <tbody>
                {mix.map((row) => (
                  <tr key={row.band} className="border-t border-stone-100">
                    <td className="py-2 pr-2 font-medium">{row.band}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{row.orders}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      <Money pesewas={row.revenuePesewa} short />
                    </td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${kilo.perKiloPesewa !== null && row.perKiloPesewa < kilo.perKiloPesewa ? 'text-red-700' : ''}`}>
                      {moneyShort(row.perKiloPesewa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Tax ${label}, for the return`}>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Tax value (base)</dt>
            <dd className="font-medium tabular-nums">
              <Money pesewas={tax.basePesewa} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">VAT 15%</dt>
            <dd className="font-medium tabular-nums">
              <Money pesewas={tax.vatPesewa} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">NHIL 2.5%</dt>
            <dd className="font-medium tabular-nums">
              <Money pesewas={tax.nhilPesewa} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">GETFund 2.5%</dt>
            <dd className="font-medium tabular-nums">
              <Money pesewas={tax.getfundPesewa} />
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-stone-500">Stored per order at creation, never recomputed, so a rate change cannot rewrite a filed return.</p>
      </Section>
    </Page>
  );
}
