import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { smsMessage } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { getOrderDetail, type OrderStatus } from '@/lib/orders';
import { moneyShort, weightLabel } from '@/lib/money';
import { Badge, Money, Page, Section, StatusBadge } from '@/components/ui';
import { PaymentForm, PrintButton, StatusMoveForm, ConfirmMomoForm, CancelOrderForm } from '@/components/order-detail-actions';
import { BackIcon } from '@/components/icons';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: 'Order · Lawmann Laundry' };
  await ensureBooted();
  const detail = await getOrderDetail(getDb(), id, session);
  return { title: detail ? `${detail.order.orderNo} · Lawmann Laundry` : 'Order · Lawmann Laundry' };
}

const NEXT_MOVES: Partial<Record<OrderStatus, Array<{ to: OrderStatus; label: string }>>> = {
  received: [
    { to: 'washing', label: 'Start washing' },
    { to: 'cancelled', label: 'Cancel' },
  ],
  washing: [
    { to: 'ready', label: 'Mark ready, texts the student' },
    { to: 'cancelled', label: 'Cancel' },
  ],
  ready: [{ to: 'collected', label: 'Hand over, collect the balance' }],
};

function formatDate(d: Date | null): string {
  if (!d) return '-';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;
  const { id } = await params;
  await ensureBooted();
  const db = getDb();
  const detail = await getOrderDetail(db, id, session);
  if (!detail) notFound();

  const messages = await db
    .select()
    .from(smsMessage)
    .where(eq(smsMessage.orderId, id))
    .orderBy(asc(smsMessage.createdAt));

  const moves = NEXT_MOVES[detail.order.status] ?? [];
  const canVerifyMoney = session.role !== 'collector';
  const { order, student, location } = detail;

  return (
    <Page>
      <Link href="/app/orders" className="no-print mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-stone-600">
        <BackIcon className="h-5 w-5" />
        Orders
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold tabular-nums text-stone-900">{order.orderNo}</h1>
        <StatusBadge status={order.status} />
      </div>

      <Section title="The bag">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Student</dt>
            <dd className="text-right font-medium">
              {student.name ?? 'No name'} · <a className="underline" href={`tel:${student.phone}`}>{student.phone}</a>
              {student.room ? ` · ${student.room}` : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Taken at</dt>
            <dd className="font-medium">{location.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Weight</dt>
            <dd className="font-medium tabular-nums">
              {weightLabel(order.weightGrams)} · {order.method === 'band' ? 'by weight' : 'by item'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Taken</dt>
            <dd className="font-medium tabular-nums">{formatDate(order.createdAt)}</dd>
          </div>
          {order.promisedAt ? (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Promised</dt>
              <dd className="font-medium tabular-nums">{formatDate(order.promisedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </Section>

      <Section title="The money">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Price</dt>
            <dd className="font-bold tabular-nums">
              <Money pesewas={order.gross} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-stone-500">
            <dt>incl. VAT / NHIL / GETFund</dt>
            <dd className="tabular-nums">
              <Money pesewas={order.vat} /> / <Money pesewas={order.nhil} /> / <Money pesewas={order.getfund} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-stone-200 pt-1 text-base">
            <dt className="font-semibold">Still owing</dt>
            <dd className={`font-bold tabular-nums ${detail.balancePesewa > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {detail.balancePesewa > 0 ? <Money pesewas={detail.balancePesewa} /> : 'Settled'}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title={`Payments (${detail.payments.length})`}>
        {detail.payments.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing paid yet. The balance follows the bag until collection.</p>
        ) : (
          <ul className="mb-4 divide-y divide-stone-100">
            {detail.payments.map((p) => (
              <li key={p.id} className="flex min-h-14 items-center gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tabular-nums">
                    <Money pesewas={p.amount} /> · {p.method === 'cash' ? 'Cash' : 'MoMo'}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {formatDate(p.paidAt)}
                    {p.gatewayRef ? ` · ${p.gatewayRef}` : ''}
                  </p>
                </div>
                <StatusBadge status={p.state} />
                {p.state === 'pending_momo' && canVerifyMoney ? <ConfirmMomoForm paymentId={p.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {detail.balancePesewa > 0 && order.status !== 'cancelled' && order.status !== 'collected' ? (
          <PaymentForm orderId={order.id} balancePesewa={detail.balancePesewa} />
        ) : null}
      </Section>

      {moves.length > 0 ? (
        <Section title="Move this bag">
          <div className="flex flex-col gap-2">
            {moves
              .filter((m) => m.to !== 'cancelled')
              .map((m) => (
                <StatusMoveForm key={m.to} orderId={order.id} to={m.to} label={m.label} primary={m.to === 'ready'} />
              ))}
          </div>
        </Section>
      ) : null}

      {detail.events.length > 0 ? (
        <Section title="History">
          <ul className="space-y-1 text-sm text-stone-600">
            {detail.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {e.from} → {e.to} · {e.staffName}
                </span>
                <span className="tabular-nums">{formatDate(e.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {messages.length > 0 ? (
        <Section title={`Messages (${messages.length})`}>
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded-md bg-stone-50 px-3 py-2 text-sm">
                <p className="text-stone-800">{m.body}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                  <Badge tone={m.state === 'sent' ? 'green' : m.state === 'failed' ? 'red' : 'stone'}>
                    {m.state === 'sent' ? 'Sent' : m.state === 'failed' ? `Failed: ${m.error ?? 'unknown reason'}` : 'Waiting for gateway'}
                  </Badge>
                  {formatDate(m.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="no-print mt-4 flex flex-col gap-2">
        <Link
          href={`/app/orders/${order.id}/receipt`}
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 font-semibold text-stone-800"
        >
          Receipt
        </Link>
        <PrintButton />
        {canVerifyMoney && order.status !== 'cancelled' && order.status !== 'collected' ? (
          <details className="rounded-lg border border-red-200 bg-white">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-red-700">
              Danger zone
            </summary>
            <div className="border-t border-red-100 p-4">
              <p className="mb-3 text-sm text-stone-600">
                Cancelling keeps the record but takes the bag out of every queue. {moneyShort(detail.balancePesewa)} owing stays visible in history.
              </p>
              <CancelOrderForm orderId={order.id} />
            </div>
          </details>
        ) : null}
      </div>
    </Page>
  );
}
