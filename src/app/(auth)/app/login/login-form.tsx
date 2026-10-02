'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction } from '@/app/actions/auth';

/**
 * Pick your name, enter your PIN. The staff list only ever contains people
 * who can log in; PIN hashes never leave the server. The botanical skin
 * carries its own field markup so the ops atoms stay teal.
 */

const inputBase =
  'min-h-12 w-full rounded-full border border-transparent bg-clay-soft px-5 text-base text-forest placeholder:text-forest/40 transition-colors duration-300 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/60';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-forest px-6 text-sm font-semibold uppercase tracking-widest text-alabaster transition-colors duration-300 hover:bg-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 disabled:opacity-50"
    >
      {pending ? 'Opening…' : 'Open Lawmann'}
    </button>
  );
}

export function LoginForm({ staff }: { staff: Array<{ id: string; name: string; role: string }> }) {
  const [state, action] = useActionState(loginAction, { ok: true });
  return (
    <form action={action} className="space-y-5">
      {!state.ok ? (
        <p role="alert" className="rounded-2xl border border-terracotta bg-clay-soft px-4 py-3 text-sm font-medium text-terracotta-deep">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="staffId" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-forest/60">
          Who are you?
        </label>
        <div className="relative">
          <select id="staffId" name="staffId" required defaultValue="" className={`${inputBase} appearance-none pr-10`}>
            <option value="" disabled>
              Choose your name
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.role}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-forest/50"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
      <div>
        <label htmlFor="pin" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-forest/60">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={8}
          required
          placeholder="••••"
          className={`${inputBase} tracking-widest`}
        />
        <p className="mt-1.5 px-5 text-xs text-forest/50">
          4 to 8 digits. Three wrong tries pauses logins for 30 seconds.
        </p>
      </div>
      <Submit />
    </form>
  );
}
