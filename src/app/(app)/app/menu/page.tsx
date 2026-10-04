import Link from 'next/link';
import { getSession } from '@/lib/session';
import { secondaryItems } from '@/components/nav-data';
import { Page, PageTitle } from '@/components/ui';

export const metadata = { title: 'Menu · Lawmann Laundry' };

export default async function MenuPage() {
  const session = await getSession();
  if (!session) return null;
  const items = secondaryItems(session.role);
  return (
    <Page>
      <PageTitle title="More" hint="Everything else, in one list." />
      <ul className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="border-b border-stone-100 last:border-b-0">
              <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 text-base font-semibold text-stone-800">
                <Icon className="h-6 w-6 text-teal-800" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
