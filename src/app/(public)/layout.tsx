import type { Viewport } from 'next';
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { WhatsAppButton, PaperGrain } from '@/components/public';
import { Wordmark } from '@/components/logo';

/**
 * The public shell in the botanical skin: alabaster ground under a paper
 * grain, serif wordmark, WhatsApp booking one tap away. No internal
 * plumbing shows here — staff reach the ops gate by URL or bookmark.
 */

export const viewport: Viewport = { themeColor: '#f9f8f4' };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="botanical flex min-h-dvh flex-col bg-alabaster font-body text-forest">
      <PaperGrain />
      <header className="sticky top-0 z-10 border-b border-stoneline bg-alabaster/90 backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-12 items-center">
            <Wordmark tone="forest" />
          </Link>
          <div className="flex items-center gap-6">
            <nav
              aria-label="Pages"
              className="hidden items-center gap-6 text-sm font-medium text-forest sm:flex"
            >
              <Link href="/pricing" className="inline-flex min-h-12 items-center transition-colors duration-300 hover:text-terracotta-deep">
                Pricing
              </Link>
              <Link href="/contact" className="inline-flex min-h-12 items-center transition-colors duration-300 hover:text-terracotta-deep">
                Contact
              </Link>
            </nav>
            <WhatsAppButton label="Book a wash" message="Hello Lawmann, I would like to book a laundry wash." />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-forest text-alabaster">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div>
              <Wordmark tone="cream" />
              <p className="mt-2 max-w-xs font-display text-lg italic text-clay">{SITE.tagline}</p>
            </div>
            <div className="space-y-2 text-sm text-alabaster/80">
              <p>WhatsApp {SITE.displayPhone}</p>
              <p>{SITE.hours}</p>
              <p>The Lawmann Store, on campus at Legon</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 border-t border-alabaster/20 pt-4 text-xs text-alabaster/70">
            <Link href="/pricing" className="inline-flex min-h-12 items-center transition-colors duration-300 hover:text-clay">
              Pricing
            </Link>
            <Link href="/contact" className="inline-flex min-h-12 items-center transition-colors duration-300 hover:text-clay">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
