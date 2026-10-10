import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getOrderDetail } from '@/lib/orders';
import { weightLabel } from '@/lib/money';
import { Money } from '@/components/ui';
import { PrintButton } from '@/components/order-detail-actions';
import { BackIcon } from '@/components/icons';

/**
 * The counter's copy: a print-friendly receipt with the Act 1151 tax split
 * the GRA expects to see, the payments, and the balance. The student's copy
 * is the SMS; this page prints to a thermal printer if one appears.
 */

function formatDate(d: Date | null): string {
  if (!d) return '-';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: 'Receipt · Lawmann Laundry' };
  await ensureBooted();
  const detail = await getOrderDetail(getDb(), id, session);
  return { title: detail ? `Receipt ${detail.order.orderNo} · Lawmann Laundry` : 'Receipt · Lawmann Laundry' };
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;
  const { id } = await params;
  await ensureBooted();
  const detail = await getOrderDetail(getDb(), id, session);
  if (!detail) notFound();
  const { order, student, location } = detail;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32 pt-4 md:pb-12 print:max-w-none print:p-0">
      <Link href={`/app/orders/${order.id}`} className="no-print mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-stone-600">
        <BackIcon className="h-5 w-5" />
        Back to order
      </Link>
      <div className="rounded-lg border border-stone-200 bg-white p-5 print:border-0 print:p-0">
        <div className="border-b border-dashed border-stone-300 pb-3 text-center">
          <p className="text-lg font-bold text-stone-900">Lawmann Laundry Service</p>
          <p className="text-sm tabular-nums text-stone-600">MoMo 0556351853</p>
        </div>
        <div className="border-b border-dashed border-stone-300 py-3 text-center">
          <p className="text-3xl font-bold tabular-nums text-stone-900">{order.orderNo}</p>
          <p className="mt-1 text-sm text-stone-600">{formatDate(order.createdAt)}</p>
        </div>
        <dl className="space-y-1 border-b border-dashed border-stone-300 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Student</dt>
            <dd className="text-right font-medium">
              {student.name ?? student.phone}
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
          {order.promisedAt ? (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Promised</dt>
              <dd className="font-medium tabular-nums">{formatDate(order.promisedAt)}</dd>
            </div>
          ) : null}
        </dl>
        <dl className="space-y-1 border-b border-dashed border-stone-300 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="font-semibold">Total</dt>
            <dd className="font-bold tabular-nums">
              <Money pesewas={order.gross} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-stone-600">
            <dt>Tax value</dt>
            <dd className="tabular-nums">
              <Money pesewas={order.base} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-stone-600">
            <dt>VAT 15%</dt>
            <dd className="tabular-nums">
              <Money pesewas={order.vat} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-stone-600">
            <dt>NHIL 2.5%</dt>
            <dd className="tabular-nums">
              <Money pesewas={order.nhil} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-stone-600">
            <dt>GETFund 2.5%</dt>
            <dd className="tabular-nums">
              <Money pesewas={order.getfund} />
            </dd>
          </div>
        </dl>
        <dl className="space-y-1 border-b border-dashed border-stone-300 py-3 text-sm">
          {detail.payments.length === 0 ? (
            <p className="text-stone-500">No payment yet.</p>
          ) : (
            detail.payments.map((p) => (
              <div key={p.id} className="flex justify-between gap-3">
                <dt className="text-stone-600">
                  {p.method === 'cash' ? 'Cash' : 'MoMo'}
                  {p.state === 'pending_momo' ? ' (pending)' : ''} · {formatDate(p.paidAt)}
                </dt>
                <dd className="font-medium tabular-nums">
                  <Money pesewas={p.amount} />
                </dd>
              </div>
            ))
          )}
          <div className="flex justify-between gap-3 pt-1 text-base">
            <dt className="font-semibold">{detail.balancePesewa < 0 ? 'Refund due' : 'Balance owing'}</dt>
            <dd className="font-bold tabular-nums">
              {detail.balancePesewa === 0 ? 'Settled' : <Money pesewas={Math.abs(detail.balancePesewa)} />}
            </dd>
          </div>
        </dl>
        <p className="pt-3 text-center text-xs text-stone-500">
          Prices include VAT, NHIL and GETFund (Act 1151). Thank you.
        </p>
      </div>
      <div className="no-print mt-4 flex justify-center">
        <PrintButton />
      </div>
    </div>
  );
}
