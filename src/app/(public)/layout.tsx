import Link from 'next/link';
import { SITE } from '@/lib/site';
import { WhatsAppButton } from '@/components/public';

/**
 * The public shell: wordmark up top, WhatsApp booking one tap away, and the
 * staff login tucked in the footer corner the way every professional
 * competitor does it.
 */

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-h-12 items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-stone-900">{SITE.name}</span>
            <span className="text-sm font-semibold text-teal-800">Laundry</span>
          </Link>
          <WhatsAppButton label="Book a wash" message="Hello Lawmann, I would like to book a laundry wash." />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-stone-900">
                {SITE.name} <span className="font-semibold text-teal-800">Laundry</span>
              </p>
              <p className="mt-1 text-sm text-stone-600">{SITE.tagline}</p>
            </div>
            <div className="text-sm text-stone-600">
              <p>WhatsApp {SITE.displayPhone}</p>
              <p className="mt-1">{SITE.hours}</p>
            </div>
          </div>
          <div className="mt-6 border-t border-stone-200 pt-4 text-xs text-stone-500">
            <Link href="/app/login" className="inline-flex min-h-12 items-center hover:text-stone-700">
              Staff login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
