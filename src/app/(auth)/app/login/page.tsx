import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { loginChoices } from '@/app/actions/auth';
import { PaperGrain } from '@/components/public';
import { Wordmark } from '@/components/logo';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Lawmann Laundry' };

export const viewport: Viewport = { themeColor: '#f9f8f4' };

/**
 * The gate between the botanical public surface and the teal ops app.
 * Staff arrive by bookmark or the /app redirect, never by a public link.
 */

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.role === 'collector' ? '/app/orders/new' : '/app');

  const staff = await loginChoices();
  return (
    <main className="botanical flex min-h-dvh flex-col items-center justify-center bg-alabaster px-4 py-10 font-body text-forest">
      <PaperGrain />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Wordmark size="lg" tone="forest" />
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight">
            Who is <span className="italic text-terracotta-deep">working</span>?
          </h1>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-soft-lg sm:p-8">
          {staff.length === 0 ? (
            <p className="text-sm leading-relaxed text-forest/70">
              Nobody can log in yet. The owner sets staff PINs up first, so run the seed script to
              load the demo team.
            </p>
          ) : (
            <LoginForm staff={staff} />
          )}
        </div>
      </div>
    </main>
  );
}
