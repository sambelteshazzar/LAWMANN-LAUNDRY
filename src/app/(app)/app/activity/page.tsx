import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { staff } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { activityFeed, type ActivityKind } from '@/lib/activity';
import { EmptyState, Field, Page, PageTitle, Section, SelectInput, TextInput } from '@/components/ui';

export const metadata = { title: 'Activity · Lawmann Laundry' };

const KINDS: Array<{ key: string; label: string }> = [
  { key: '', label: 'Everything' },
  { key: 'order', label: 'Bags taken' },
  { key: 'status', label: 'Status moves' },
  { key: 'payment', label: 'Payments' },
  { key: 'cost', label: 'Costs' },
  { key: 'shift', label: 'Shifts' },
  { key: 'sms', label: 'Messages' },
];

const KIND_TONE: Record<string, string> = {
  order: 'bg-teal-50 text-teal-900',
  status: 'bg-sky-50 text-sky-900',
  payment: 'bg-green-50 text-green-900',
  cost: 'bg-stone-100 text-stone-700',
  shift: 'bg-stone-100 text-stone-700',
  sms: 'bg-amber-50 text-amber-900',
};

function todayISO(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function formatTime(d: Date): string {
  return d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Everything that happened at the shop, derived live from the real tables.
 * Filters are plain GET params — no client JavaScript needed to look back.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ day?: string; kind?: string; staffId?: string }> }) {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/app/orders/new');

  const params = await searchParams;
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(params.day ?? '') ? params.day! : todayISO();
  const kindParam = KINDS.some((k) => k.key === params.kind) && params.kind ? (params.kind as ActivityKind) : undefined;

  await ensureBooted();
  const db = getDb();
  const [feed, staffRows] = await Promise.all([
    activityFeed(db, session.shopId, {
      day: new Date(`${dayParam}T00:00:00Z`),
      kind: kindParam,
      staffId: params.staffId || undefined,
      limit: 200,
    }),
    db.select({ id: staff.id, name: staff.name }).from(staff).orderBy(asc(staff.name)),
  ]);

  return (
    <Page>
      <PageTitle title="Activity" hint="Everything that happened, newest first — read straight from the books." />
      <Section>
        <form method="get" className="grid grid-cols-2 gap-3">
          <Field label="Day" htmlFor="day">
            <TextInput id="day" name="day" type="date" defaultValue={dayParam} required />
          </Field>
          <Field label="Kind" htmlFor="kind">
            <SelectInput id="kind" name="kind" defaultValue={kindParam ?? ''}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="col-span-2">
            <Field label="Who" htmlFor="staffId">
              <SelectInput id="staffId" name="staffId" defaultValue={params.staffId ?? ''}>
                <option value="">Everyone</option>
                {staffRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="col-span-2">
            <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-stone-300 bg-white px-5 font-semibold text-stone-800">
              Show
            </button>
          </div>
        </form>
      </Section>
      {feed.length === 0 ? (
        <EmptyState title="Nothing happened that day." hint="Pick another day, or clear the filters." />
      ) : (
        <Section>
          <ul className="divide-y divide-stone-100">
            {feed.map((item, i) => (
              <li key={i} className="flex gap-3 py-2">
                <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-stone-500">{formatTime(item.at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-stone-800">{item.text}</p>
                  <p className="mt-0.5 flex items-center gap-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_TONE[item.kind] ?? 'bg-stone-100 text-stone-700'}`}>
                      {item.kind}
                    </span>
                    {item.orderId ? (
                      <Link href={`/app/orders/${item.orderId}`} className="inline-flex min-h-12 items-center text-xs font-semibold text-teal-800 underline">
                        Open order
                      </Link>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
