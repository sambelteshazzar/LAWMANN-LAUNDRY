/**
 * The Lawmann mark: a folded shirt in two flat shapes, the fold line drawn
 * as negative space between them. Two geometric primitives, no gradients,
 * legible from a 16px favicon to a shopfront sign. currentColor so it sits
 * in teal on white or white on teal.
 */

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" className={className ?? 'h-6 w-6'}>
      <rect x="8.5" y="5" width="15" height="5.5" rx="1.5" />
      <path d="M5.5 12.5h21v11.5a2.5 2.5 0 0 1-2.5 2.5h-16a2.5 2.5 0 0 1-2.5-2.5Z" />
    </svg>
  );
}

/**
 * Mark plus name, the lockup every surface shares. One size scale: the mark
 * tracks the name height, the two-tone name stays the brand voice.
 */
export function Wordmark({ size = 'md', tone = 'teal' }: { size?: 'md' | 'lg'; tone?: 'teal' | 'forest' | 'cream' }) {
  const mark = size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';
  const name = size === 'lg' ? 'text-xl' : 'text-lg';
  const serif = tone === 'forest' || tone === 'cream';
  const markTone = tone === 'cream' ? 'text-clay' : tone === 'forest' ? 'text-forest' : 'text-teal-800';
  const nameTone = tone === 'cream' ? 'text-alabaster' : 'text-forest';
  const accentTone = tone === 'cream' ? 'text-clay' : 'text-terracotta-deep';
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={`${mark} shrink-0 ${markTone}`} />
      {serif ? (
        <span className={`font-display ${name} font-bold tracking-tight ${nameTone}`}>
          Lawmann <span className={`italic font-semibold ${accentTone}`}>Laundry</span>
        </span>
      ) : (
        <span className={`${name} font-extrabold tracking-tight text-stone-900`}>
          Lawmann <span className="font-semibold text-teal-800">Laundry</span>
        </span>
      )}
    </span>
  );
}
