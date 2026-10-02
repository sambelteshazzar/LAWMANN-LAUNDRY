import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { BottomNav, SideNav } from '@/components/nav';
import { LogoutIcon } from '@/components/icons';
import { LogoMark } from '@/components/logo';
import { logoutAction } from '@/app/actions/auth';

/**
 * The gate: every page in the app knows who is working, or sends them to
 * sign in. The shell is a bottom tab bar on phones (thumbs) and a sidebar
 * on desktop, both from the same role-filtered nav.
 */

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/app/login');
  const role = session.role.charAt(0).toUpperCase() + session.role.slice(1);

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2.5 md:hidden">
            <LogoMark className="h-6 w-6 shrink-0 text-teal-800" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-stone-900">Lawmann Laundry</p>
              <p className="truncate text-xs text-stone-500">
                {session.name} · {role}
              </p>
            </div>
          </div>
          <p className="hidden min-w-0 truncate text-sm font-semibold text-stone-600 md:block">
            {session.name} · {role}
          </p>
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
