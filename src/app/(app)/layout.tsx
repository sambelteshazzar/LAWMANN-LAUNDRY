import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { BottomNav, SideNav } from '@/components/nav';
import { LogoutIcon } from '@/components/icons';
import { logoutAction } from '@/app/actions/auth';

/**
 * The gate: every page in the app knows who is working, or sends them to
 * sign in. The shell is a bottom tab bar on phones (thumbs) and a sidebar
 * on desktop, both from the same role-filtered nav.
 */

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-stone-900">Lawmann Laundry</p>
            <p className="truncate text-xs text-stone-500">
              {session.name} · {session.role}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="flex min-h-12 min-w-12 items-center justify-center rounded-md px-2 text-stone-500 hover:bg-stone-100"
            >
              <LogoutIcon className="h-6 w-6" />
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl gap-6 px-0 md:px-4 md:py-4">
        <div className="pt-4">
          <SideNav role={session.role} staffName={session.name} />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <BottomNav role={session.role} />
    </div>
  );
}
