import { redirect } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentShift, lastClosedShift } from '@/lib/shifts';
import { plain } from '@/lib/money';
import { EmptyState, Field, Money, Page, PageTitle, Section, TextInput } from '@/components/ui';
import { ActionForm, PrimaryButton } from '@/components/form-buttons';
import { closeShiftAction, openShiftAction } from '@/app/actions/ops';

export const metadata = { title: 'Shifts · Lawmann Laundry' };

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The cash drawer: open with a float, close by counting. The variance is
 * the first sign of a leak, and leaks compound weekly — so the last closed
 * shift keeps showing it, big, until the next shift opens.
 */
export default async function ShiftsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/app/orders/new');

  await ensureBooted();
  const db = getDb();
  const [shift, lastClosed] = await Promise.all([currentShift(db, session.shopId), lastClosedShift(db, session.shopId)]);

  return (
    <Page>
      <PageTitle title="Shifts" hint="One open at a time. Counted against expected on close." />
      {shift ? (
        <Section title={`Open · ${shift.staffName} · since ${formatDateTime(shift.openedAt)}`}>
          <p className="mb-4 text-sm text-stone-600">
            Float <Money pesewas={shift.float} />. Count every cedi in the drawer, then close.
          </p>
          <ActionForm action={closeShiftAction}>
            <input type="hidden" name="shiftId" value={shift.id} />
            <Field label="Cash counted in the drawer (GH¢)" htmlFor="counted">
              <TextInput id="counted" name="counted" inputMode="decimal" required placeholder="e.g. 450" />
            </Field>
            <Field label="MoMo meter reading (optional)" htmlFor="momoAtClose" hint="The balance showing on the MoMo phone, if you track it.">
              <TextInput id="momoAtClose" name="momoAtClose" inputMode="decimal" placeholder="Optional" />
            </Field>
            <PrimaryButton>Close shift</PrimaryButton>
          </ActionForm>
        </Section>
      ) : (
        <>
          {lastClosed ? (
            <div className={`mb-4 rounded-lg border p-4 ${lastClosed.variancePesewa === 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                Last closed · {lastClosed.staffName} · {formatDateTime(lastClosed.closedAt)}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {lastClosed.variancePesewa === 0
                  ? 'Drawer was exact.'
                  : lastClosed.variancePesewa > 0
                    ? `+GH¢${plain(lastClosed.variancePesewa)} over`
                    : `−GH¢${plain(lastClosed.variancePesewa).slice(1)} short`}
              </p>
              <p className="mt-1 text-sm tabular-nums text-stone-600">
                Counted GH¢{plain(lastClosed.countedPesewa)} · expected GH¢{plain(lastClosed.expectedPesewa)}
              </p>
            </div>
          ) : null}
          <Section title="Open a shift">
            <ActionForm action={openShiftAction}>
              <Field label="Float in the drawer (GH¢)" htmlFor="float" hint="The cash you start with, for giving change.">
                <TextInput id="float" name="float" inputMode="decimal" required placeholder="e.g. 100" />
              </Field>
              <PrimaryButton>Open shift</PrimaryButton>
            </ActionForm>
          </Section>
          <EmptyState title="No shift open." hint="Open one at the start of the day so the drawer stays honest." />
        </>
      )}
    </Page>
  );
}
