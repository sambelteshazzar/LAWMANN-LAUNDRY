'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions/auth';

/**
 * Client-side form atoms. The only reason this file is client-rendered is
 * the pending state: everything else stays a server component.
 */

const base =
  'inline-flex min-h-12 items-center justify-center rounded-md px-5 text-base font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2';

export function PrimaryButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${base} w-full bg-teal-700 text-white hover:bg-teal-800`}>
      {pending ? 'Saving…' : children}
    </button>
  );
}

export function DangerButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${base} w-full bg-red-700 text-white hover:bg-red-800`}>
      {pending ? 'Saving…' : children}
    </button>
  );
}

export function SecondaryButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${base} w-full border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
      {error}
    </p>
  );
}

/**
 * A complete small form: posts to a server action, shows its error, and
 * gives every submit button inside the pending state. For forms whose
 * result needs displaying (not just errors), use useActionState directly.
 */
export function ActionForm({
  action,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, { ok: true });
  return (
    <form action={formAction}>
      <FormError error={state.ok ? undefined : state.error} />
      {children}
    </form>
  );
}
