import Link from 'next/link';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { listOrders, type OrderListFilter } from '@/lib/orders';
import { weightLabel } from '@/lib/money';
import { EmptyState, Money, Page, PageTitle, Section, StatusBadge } from '@/components/ui';
import { PlusIcon } from '@/components/icons';

export const metadata = { title: 'Orders · Lawmann Laundry' };

const TABS: Array<{ key: OrderListFilter; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'ready', label: 'Ready' },
  { key: 'all', label: 'All' },
  { key: 'collected', label: 'Collected' },
  { key: 'cancelled', label: 'Cancelled' },
];

function ageLabel(from: Date): string {
  const days = Math.floor((Date.now() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await getSession();
  if (!session) return null;
  const params = await searchParams;
  const filter: OrderListFilter =
    params.status === 'ready' || params.status === 'all' || params.status === 'collected' || params.status === 'cancelled'
      ? params.status
      : 'open';

  await ensureBooted();
  const orders = await listOrders(getDb(), session, filter);

  return (
    <Page>
      <div className="mb-4 flex items-start justify-between gap-3">
        <PageTitle title="Orders" hint={filter === 'open' ? 'Bags still in the shop.' : undefined} />
        <Link
          href="/orders/new"
          className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-md bg-teal-700 px-4 font-semibold text-white"
        >
          <PlusIcon className="h-5 w-5" />
          New bag
        </Link>
      </div>
      <div className="no-print mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Order filters">
        {TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={active}
              href={tab.key === 'open' ? '/orders' : `/orders?status=${tab.key}`}
              className={`flex min-h-12 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
                active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-inset ring-stone-200'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {orders.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'No open orders.' : `No ${filter} orders.`}
          hint={filter === 'open' ? 'Take a bag to start the day.' : undefined}
        />
      ) : (
        <Section>
          <ul className="divide-y divide-stone-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex min-h-16 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold tabular-nums text-stone-900">{o.orderNo}</p>
                    <p className="truncate text-sm text-stone-500">
                      {o.studentName ?? o.studentPhone} · {weightLabel(o.weightGrams)} · {ageLabel(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={o.status} />
                    {o.balancePesewa > 0 ? (
                      <span className="text-sm font-bold tabular-nums text-red-700">
                        <Money pesewas={o.balancePesewa} short />
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-green-700">Settled</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
