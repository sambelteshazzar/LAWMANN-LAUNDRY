import type { ReactNode } from 'react';
import { SITE, whatsappUrl } from '@/lib/site';

/**
 * The public surface's shared primitives. The fold line is the identity
 * motif: two hairlines one pixel apart, like a pressed fold. Every button is
 * a real anchor (wa.me and tel:), 48px tall, teal-800 on white.
 */

export function FoldLine() {
  return <div aria-hidden="true" className="h-[3px] w-full border-y border-stone-200" />;
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4">{children}</div>;
}

export function WhatsAppButton({ label, message }: { label: string; message: string }) {
  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center rounded-md bg-teal-800 px-5 text-sm font-semibold text-white hover:bg-teal-900"
    >
      {label}
    </a>
  );
}

export function CallButton() {
  return (
    <a
      href={`tel:+${SITE.whatsappNumber}`}
      className="inline-flex min-h-12 items-center rounded-md border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 hover:bg-stone-100"
    >
      Call {SITE.displayPhone}
    </a>
  );
}

export function PhotoPlaceholder({ hint }: { hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-12 text-center">
      <p className="text-sm text-stone-500">{hint}</p>
    </div>
  );
}
