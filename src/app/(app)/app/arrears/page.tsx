import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { arrearsList } from '@/lib/reports';
import { money } from '@/lib/money';
import { EmptyState, Money, Page, PageTitle, Section, StatusBadge, ageLabel } from '@/components/ui';

export const metadata = { title: 'Owing · Lawmann Laundry' };

/**
 * Who still owes, oldest first — the list the owner wants collecting. Every
 * row carries a phone number and a way to call it.
 */
export default async function ArrearsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/app/orders/new');

  await ensureBooted();
  const arrears = await arrearsList(getDb(), session.shopId);
  const total = arrears.reduce((acc, a) => acc + a.balancePesewa, 0);

  return (
    <Page>
      <PageTitle
        title="Still owing"
        hint={arrears.length === 0 ? undefined : `${money(total)} across ${arrears.length} ${arrears.length === 1 ? 'order' : 'orders'}, oldest first.`}
      />
      {arrears.length === 0 ? (
        <EmptyState title="Nobody owes anything." hint="Every open order is settled in full." />
      ) : (
        <Section>
          <ul className="divide-y divide-stone-100">
            {arrears.map((a) => (
              <li key={a.orderId} className="flex min-h-16 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {a.studentName ?? 'No name recorded'}
                  </p>
                  <p className="truncate text-sm tabular-nums text-stone-500">
                    {a.studentPhone}
                    {a.studentRoom ? ` · ${a.studentRoom}` : ''} · {a.orderNo} · {ageLabel(a.createdAt)}
                  </p>
                  <p className="mt-1 flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    <a href={`tel:${a.studentPhone}`} className="inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 underline">
                      Call
                    </a>
                    <Link href={`/app/orders/${a.orderId}`} className="inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 underline">
                      Open order
                    </Link>
                  </p>
                </div>
                <span className="shrink-0 text-base font-bold tabular-nums text-red-700">
                  <Money pesewas={a.balancePesewa} short />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
