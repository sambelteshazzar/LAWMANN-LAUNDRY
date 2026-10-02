import type { ReactNode } from 'react';
import { money, moneyShort } from '@/lib/money';

/**
 * The shared primitives. Everything interactive is at least 48px tall, every
 * figure renders tabular so columns of money line up, and status always
 * shows as a labeled badge — never color alone.
 */

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4 md:pb-12">{children}</div>;
}

export function PageTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-stone-900">{title}</h1>
      {hint ? <p className="mt-1 text-sm text-stone-500">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
      {title ? <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{value}</div>
      {sub ? <div className="mt-1 text-sm text-stone-500">{sub}</div> : null}
    </div>
  );
}

export function Money({ pesewas, short }: { pesewas: number; short?: boolean }) {
  return <span className="tabular-nums">{short ? moneyShort(pesewas) : money(pesewas)}</span>;
}

type BadgeTone = 'stone' | 'blue' | 'green' | 'amber' | 'red';

const BADGE_TONES: Record<BadgeTone, string> = {
  stone: 'bg-stone-100 text-stone-700',
  blue: 'bg-sky-100 text-sky-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_TONES[tone]}`}>
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  received: { label: 'Received', tone: 'stone' },
  washing: { label: 'Washing', tone: 'blue' },
  ready: { label: 'Ready', tone: 'green' },
  collected: { label: 'Collected', tone: 'stone' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  pending_momo: { label: 'MoMo pending', tone: 'amber' },
  reversed: { label: 'Reversed', tone: 'red' },
  queued: { label: 'Waiting', tone: 'stone' },
  sent: { label: 'Sent', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cash: { label: 'Cash', tone: 'stone' },
  momo: { label: 'MoMo', tone: 'stone' },
};

export function StatusBadge({ status }: { status: string }) {
  const found = STATUS_LABELS[status] ?? { label: status, tone: 'stone' as BadgeTone };
  return <Badge tone={found.tone}>{found.label}</Badge>;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-stone-800">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-sm text-stone-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full min-h-12 rounded-md border border-stone-300 bg-white px-3 text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-100';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
      <p className="font-semibold text-stone-800">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">{hint}</p> : null}
      {children ? <div className="mt-4 flex justify-center">{children}</div> : null}
    </div>
  );
}
