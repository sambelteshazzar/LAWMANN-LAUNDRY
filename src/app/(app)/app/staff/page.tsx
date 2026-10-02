import { redirect } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { getDb, ensureBooted } from '@/lib/db';
import { staff } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { Badge, Field, Page, PageTitle, Section, SelectInput, TextInput } from '@/components/ui';
import { ActionForm, PrimaryButton, SecondaryButton } from '@/components/form-buttons';
import { createStaffAction, resetPinAction } from '@/app/actions/auth';

export const metadata = { title: 'Staff · Lawmann Laundry' };

/**
 * Owner only: who can open the app, in which role, under which PIN. A PIN
 * change takes effect on the next request — a fired collector loses access
 * immediately, not at cookie expiry.
 */
export default async function StaffPage() {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== 'owner') redirect('/app');

  await ensureBooted();
  const rows = await getDb().select().from(staff).orderBy(asc(staff.name));

  return (
    <Page>
      <PageTitle title="Staff" hint="Names, roles, PINs. Only you see this page." />
      <Section title="Everyone with access">
        <ul className="divide-y divide-stone-100">
          {rows.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{s.name}</p>
                  <p className="mt-0.5">
                    <Badge tone={s.role === 'owner' ? 'green' : 'stone'}>{s.role}</Badge>
                  </p>
                </div>
                <span className={`text-xs font-semibold ${s.pinHash ? 'text-green-700' : 'text-red-700'}`}>
                  {s.pinHash ? 'PIN set' : 'No PIN, cannot log in'}
                </span>
              </div>
              <ActionForm action={resetPinAction}>
                <input type="hidden" name="staffId" value={s.id} />
                <div className="mt-2 flex gap-2">
                  <TextInput name="pin" inputMode="numeric" maxLength={8} required placeholder="New 4 to 8 digit PIN" aria-label={`New PIN for ${s.name}`} />
                  <div className="w-32 shrink-0">
                    <SecondaryButton>Set PIN</SecondaryButton>
                  </div>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Add someone">
        <ActionForm action={createStaffAction}>
          <Field label="Name" htmlFor="name">
            <TextInput id="name" name="name" autoComplete="off" required maxLength={80} placeholder="e.g. Efua" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" htmlFor="role">
              <SelectInput id="role" name="role" required defaultValue="collector">
                <option value="collector">Collector (intake only)</option>
                <option value="counter">Counter (intake, money, shifts)</option>
                <option value="owner">Owner (everything)</option>
              </SelectInput>
            </Field>
            <Field label="PIN" htmlFor="pin">
              <TextInput id="pin" name="pin" inputMode="numeric" maxLength={8} required placeholder="4 to 8 digits" />
            </Field>
          </div>
          <PrimaryButton>Add staff</PrimaryButton>
        </ActionForm>
      </Section>
    </Page>
  );
}
