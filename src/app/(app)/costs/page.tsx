import { redirect } from 'next/navigation';
import { getDb, ensureBooted } from '@/lib/db';
import { getSession } from '@/lib/session';
import { listCosts } from '@/lib/costs';
import { COST_CATEGORIES } from '@/lib/validation';
import { EmptyState, Field, Money, Page, PageTitle, Section, SelectInput, TextInput } from '@/components/ui';
import { ActionForm, PrimaryButton } from '@/components/form-buttons';
import { addCostAction } from '@/app/actions/ops';

export const metadata = { title: 'Costs · Lawmann Laundry' };

const CATEGORY_LABELS: Record<string, string> = {
  gas: 'Gas',
  electricity: 'Electricity',
  water: 'Water',
  detergent: 'Detergent & bleach',
  wages: 'Wages',
  transport: 'Transport & fuel',
  rent: 'Rent',
  maintenance: 'Maintenance',
  other: 'Other',
};

function todayISO(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The profit side's raw material: five numbers a week from receipts the
 * owner already has. Without these, the app knows what came in but not
 * what was made — and only the second number matters.
 */
export default async function CostsPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'collector') redirect('/orders/new');

  await ensureBooted();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const costs = await listCosts(getDb(), session.shopId, monthStart, now);
  const total = costs.reduce((acc, c) => acc + c.amount, 0);

  return (
    <Page>
      <PageTitle title="Costs" hint="Enter the bills once a week. Gas, power, water, detergent, wages — from the receipts." />
      <Section title="Record a bill">
        <ActionForm action={addCostAction}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="category">
              <SelectInput id="category" name="category" required defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c] ?? c}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount (GH¢)" htmlFor="amount">
              <TextInput id="amount" name="amount" inputMode="decimal" required placeholder="e.g. 80" />
            </Field>
          </div>
          <Field label="What was it?" htmlFor="label" hint="Optional. “Total refill”, “Kofi week”.">
            <TextInput id="label" name="label" autoComplete="off" maxLength={80} placeholder="Optional" />
          </Field>
          <Field label="Paid on" htmlFor="incurredOn">
            <TextInput id="incurredOn" name="incurredOn" type="date" required defaultValue={todayISO()} />
          </Field>
          <PrimaryButton>Record bill</PrimaryButton>
        </ActionForm>
      </Section>
      <Section title={`This month · ${costs.length} ${costs.length === 1 ? 'bill' : 'bills'} · total`}>
        {costs.length === 0 ? (
          <EmptyState title="No bills yet this month." hint="Record the gas refill and the app starts knowing what you made." />
        ) : (
          <>
            <p className="mb-3 text-2xl font-bold tabular-nums">
              <Money pesewas={total} />
            </p>
            <ul className="divide-y divide-stone-100">
              {costs.map((c) => (
                <li key={c.id} className="flex min-h-14 items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">{c.label || CATEGORY_LABELS[c.category] || c.category}</p>
                    <p className="text-xs tabular-nums text-stone-500">{c.incurredOn}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    <Money pesewas={c.amount} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </Page>
  );
}
