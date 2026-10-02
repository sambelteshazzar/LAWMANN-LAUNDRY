import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { arrearsList, intakeCounts, moneyToday, statusCounts } from '@/lib/reports';
import { currentShift } from '@/lib/shifts';
import { listCosts } from '@/lib/costs';
import { EmptyState, Money, Page, Section, StatusBadge, ageLabel } from '@/components/ui';

export const metadata = { title: 'Home · Lawmann Laundry' };

function formatTime(d: Date): string {
  return d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The owner's home: today's confirmed money, pending MoMo kept separate,
 * bags in, who owes, and the state of the drawer. Collectors never see
 * this page — their home is the intake screen.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/orders/new');

  await ensureBooted();
  const db = getDb();
  const now = new Date();
  const [money, counts, statuses, arrears, shift] = await Promise.all([
    moneyToday(db, session.shopId, now),
    intakeCounts(db, session.shopId, now),
    statusCounts(db, session.shopId),
    arrearsList(db, session.shopId),
    currentShift(db, session.shopId),
  ]);
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const weekCosts = await listCosts(db, session.shopId, weekStart, now);
  const weekCostsTotal = weekCosts.reduce((acc, c) => acc + c.amount, 0);
  const owingTotal = arrears.reduce((acc, a) => acc + a.balancePesewa, 0);
  const topArrears = arrears.slice(0, 5);

  return (
    <Page>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-stone-900">Today</h1>
        <p className="mt-1 text-sm text-stone-500">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm text-stone-500">Money in today</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            <Money pesewas={money.confirmedPesewa} />
          </div>
          <div className="mt-1 text-sm text-stone-500">
            {money.confirmedCount === 1 ? '1 payment' : `${money.confirmedCount} payments`}
          </div>
        </div>
        <div className={`rounded-lg border p-4 ${money.pendingCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'}`}>
          <div className="text-sm text-stone-500">MoMo claimed, not confirmed</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            <Money pesewas={money.pendingPesewa} />
          </div>
          <div className="mt-1 text-sm text-stone-500">
            {money.pendingCount === 0 ? 'nothing waiting' : `${money.pendingCount} waiting on you`}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm text-stone-500">Bags in</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{counts.day}</div>
          <div className="mt-1 text-sm text-stone-500">
            {counts.week} this week · {counts.month} this month
          </div>
        </div>
        <Link href="/arrears" className={`rounded-lg border p-4 ${owingTotal > 0 ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white'}`}>
          <div className="text-sm text-stone-500">Still owing</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            <Money pesewas={owingTotal} />
          </div>
          <div className="mt-1 text-sm text-stone-500">
            {arrears.length === 0 ? 'everyone settled' : `${arrears.length} open ${arrears.length === 1 ? 'debt' : 'debts'}`}
          </div>
        </Link>
      </div>

      <Section title="Bags in the shop">
        <div className="flex flex-wrap gap-2">
          {(['received', 'washing', 'ready'] as const).map((s) => (
            <Link
              key={s}
              href={s === 'received' ? '/orders' : `/orders?status=${s}`}
              className="flex min-h-12 items-center gap-2 rounded-md border border-stone-200 px-3 text-sm font-semibold text-stone-700"
            >
              <StatusBadge status={s} />
              <span className="tabular-nums">{statuses[s] ?? 0}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section title={topArrears.length > 0 ? `Oldest debts (top ${topArrears.length} of ${arrears.length})` : 'Debts'}>
        {topArrears.length === 0 ? (
          <EmptyState title="Nobody owes anything." hint="Every open order is settled in full." />
        ) : (
          <ul className="divide-y divide-stone-100">
            {topArrears.map((a) => (
              <li key={a.orderId}>
                <Link href={`/orders/${a.orderId}`} className="flex min-h-16 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">
                      {a.studentName ?? a.studentPhone}
                    </p>
                    <p className="truncate text-sm tabular-nums text-stone-500">
                      {a.orderNo} · {ageLabel(a.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-bold tabular-nums text-red-700">
                    <Money pesewas={a.balancePesewa} short />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {arrears.length > 5 ? (
          <Link href="/arrears" className="mt-2 inline-flex min-h-12 items-center text-sm font-semibold text-teal-800">
            See all {arrears.length} debts
          </Link>
        ) : null}
      </Section>

      <Section title="Drawer and week">
        {shift ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-700">
              Shift open — {shift.staffName}, float <Money pesewas={shift.float} />, since {formatTime(shift.openedAt)}
            </p>
            <Link href="/shifts" className="inline-flex min-h-12 shrink-0 items-center rounded-md border border-stone-300 px-3 text-sm font-semibold">
              Close
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-700">No shift open. Open one to track the drawer.</p>
            <Link href="/shifts" className="inline-flex min-h-12 shrink-0 items-center rounded-md border border-stone-300 px-3 text-sm font-semibold">
              Open
            </Link>
          </div>
        )}
        <p className="mt-2 text-sm text-stone-500">
          Costs this week: <Money pesewas={weekCostsTotal} /> across {weekCosts.length} {weekCosts.length === 1 ? 'bill' : 'bills'}
        </p>
      </Section>
    </Page>
  );
}
