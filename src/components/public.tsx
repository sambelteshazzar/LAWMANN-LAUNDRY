import type { ReactNode } from 'react';
import Link from 'next/link';
import { SITE, whatsappUrl } from '@/lib/site';
import { StarIcon } from '@/components/icons';

/**
 * The public surface's shared primitives, in the botanical skin: paper grain,
 * alabaster ground, forest text, pill buttons, arch imagery. Every button is
 * still a real anchor (wa.me and tel:), 48px tall, matched in pairs.
 */

export function PaperGrain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.015]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

export function FoldLine() {
  return <div aria-hidden="true" className="h-[3px] w-full border-y border-stoneline" />;
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>;
}

export function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`py-16 md:py-24 ${className}`}>{children}</section>;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-sage-soft px-4 py-1.5 text-sm font-semibold text-forest">
      <StarIcon className="h-4 w-4 text-terracotta-deep" />
      {children}
    </p>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta-deep">{children}</p>
  );
}

const buttonBase =
  'inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-semibold uppercase tracking-widest transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2';

export function WhatsAppButton({
  label,
  message,
  tone = 'dark',
}: {
  label: string;
  message: string;
  tone?: 'dark' | 'cream';
}) {
  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonBase} px-7 ${
        tone === 'cream'
          ? 'bg-alabaster text-forest ring-offset-forest hover:bg-clay'
          : 'bg-forest text-alabaster ring-offset-alabaster hover:bg-terracotta'
      }`}
    >
      {label}
    </a>
  );
}

export function CallButton({ tone = 'dark' }: { tone?: 'dark' | 'cream' }) {
  return (
    <a
      href={`tel:+${SITE.whatsappNumber}`}
      className={`${buttonBase} ${
        tone === 'cream'
          ? 'border border-alabaster/60 bg-transparent text-alabaster ring-offset-forest hover:border-clay hover:text-clay'
          : 'border border-sage-deep bg-transparent text-forest ring-offset-alabaster hover:border-terracotta-deep hover:text-terracotta-deep'
      }`}
    >
      Call {SITE.displayPhone}
    </a>
  );
}

export function PillLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`${buttonBase} border border-sage-deep bg-transparent text-forest hover:border-terracotta-deep hover:text-terracotta-deep`}
    >
      {children}
    </Link>
  );
}

export function ArchPhoto({ hint }: { hint: string }) {
  return (
    <figure
      className="relative flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-t-full border border-stoneline bg-clay-soft md:aspect-square md:h-[440px]"
      aria-label="Photo placeholder"
    >
      <span className="pointer-events-none absolute inset-3 rounded-t-full border border-dashed border-sage" />
      <p className="max-w-48 text-center text-sm font-medium text-forest/60">{hint}</p>
    </figure>
  );
}
