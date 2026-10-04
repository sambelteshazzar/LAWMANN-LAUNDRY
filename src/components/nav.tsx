'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth';
import { LogoMark } from '@/components/logo';
import { NAV_ITEMS, isActive, primaryTabs } from './nav-data';

export type { NavEntry } from './nav-data';
export { NAV_ITEMS, isActive, primaryTabs, secondaryItems } from './nav-data';

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = primaryTabs(role);
  return (
    <nav aria-label="Primary" className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white md:hidden">
      <ul className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  active ? 'text-teal-800' : 'text-stone-500'
                }`}
              >
                <Icon className="h-6 w-6" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ role, staffName }: { role: Role; staffName: string }) {
  const pathname = usePathname();
  const allowed = NAV_ITEMS.filter((item) => item.roles.includes(role) && item.href !== '/app/menu');
  return (
    <nav aria-label="Primary" className="no-print hidden w-56 shrink-0 flex-col gap-1 md:flex">
      <div className="mb-3 flex items-center gap-2 px-2">
        <LogoMark className="h-7 w-7 shrink-0 text-teal-800" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-stone-900">Lawmann Laundry</p>
          <p className="truncate text-xs text-stone-500">{staffName}</p>
        </div>
      </div>
      {allowed.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold ${
              active ? 'bg-teal-50 text-teal-900' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
