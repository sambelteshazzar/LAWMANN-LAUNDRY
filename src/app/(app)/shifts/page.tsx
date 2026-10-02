import { redirect } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentShift } from '@/lib/shifts';
import { EmptyState, Field, Money, Page, PageTitle, Section, TextInput } from '@/components/ui';
import { ActionForm, PrimaryButton } from '@/components/form-buttons';
import { openShiftAction } from '@/app/actions/ops';
import { CloseShiftForm } from '@/components/shift-forms';

export const metadata = { title: 'Shifts · Lawmann Laundry' };

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The cash drawer: open with a float, close by counting. The variance is
 * the first sign of a leak, and leaks compound weekly — so it shows big.
 */
export default async function ShiftsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/orders/new');

  await ensureBooted();
  const shift = await currentShift(getDb(), session.shopId);

  return (
    <Page>
      <PageTitle title="Shifts" hint="One open at a time. Counted against expected on close." />
      {shift ? (
        <Section title={`Open · ${shift.staffName} · since ${formatDateTime(shift.openedAt)}`}>
          <p className="mb-4 text-sm text-stone-600">
            Float <Money pesewas={shift.float} />. Count every cedi in the drawer, then close.
          </p>
          <CloseShiftForm shiftId={shift.id} />
        </Section>
      ) : (
        <Section title="Open a shift">
          <ActionForm action={openShiftAction}>
            <Field label="Float in the drawer (GH¢)" htmlFor="float" hint="The cash you start with, for giving change.">
              <TextInput id="float" name="float" inputMode="decimal" required placeholder="e.g. 100" />
            </Field>
            <PrimaryButton>Open shift</PrimaryButton>
          </ActionForm>
        </Section>
      )}
      {!shift ? (
        <EmptyState title="No shift open." hint="Open one at the start of the day so the drawer stays honest." />
      ) : null}
    </Page>
  );
}
