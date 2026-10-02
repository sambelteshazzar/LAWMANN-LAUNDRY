import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { loginChoices } from '@/app/actions/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Lawmann Laundry' };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'collector' ? '/app/orders/new' : '/app');

  const staff = await loginChoices();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-800">Lawmann Laundry</p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">Who is working?</h1>
      </div>
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        {staff.length === 0 ? (
          <p className="text-sm text-stone-600">
            Nobody can log in yet. The owner sets staff PINs up first — run the seed script to load the demo team.
          </p>
        ) : (
          <LoginForm staff={staff} />
        )}
      </div>
    </main>
  );
}
