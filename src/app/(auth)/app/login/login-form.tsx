'use client';

import { useActionState } from 'react';
import { Field, SelectInput, TextInput } from '@/components/ui';
import { FormError, PrimaryButton } from '@/components/form-buttons';
import { loginAction } from '@/app/actions/auth';

/**
 * Pick your name, enter your PIN. The staff list only ever contains people
 * who can log in; PIN hashes never leave the server.
 */

export function LoginForm({ staff }: { staff: Array<{ id: string; name: string; role: string }> }) {
  const [state, action] = useActionState(loginAction, { ok: true });
  return (
    <form action={action}>
      <FormError error={state.ok ? undefined : state.error} />
      <Field label="Who are you?" htmlFor="staffId">
        <SelectInput id="staffId" name="staffId" required defaultValue="">
          <option value="" disabled>
            Choose your name
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.role}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="PIN" htmlFor="pin" hint="4 to 8 digits. Three wrong tries pauses logins for 30 seconds.">
        <TextInput
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={8}
          required
          placeholder="••••"
        />
      </Field>
      <PrimaryButton>Open Lawmann</PrimaryButton>
    </form>
  );
}
