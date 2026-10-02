/**
 * The only icons in the app. Hand-drawn 24px strokes, currentColor, no
 * library: ten icons do not justify a dependency on a Ghana mobile network.
 */

interface IconProps {
  className?: string;
}

function Base({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? 'h-6 w-6'}
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11v-9.5" />
    </Base>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function OrdersIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5v-8Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v8" />
    </Base>
  );
}

export function ArrearsIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.6c2.9.1 4.5 1.5 5 4" />
    </Base>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M5 7.5h14M5 12h14M5 16.5h14" />
    </Base>
  );
}

export function ActivityIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />
    </Base>
  );
}

export function CostsIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
      <path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </Base>
  );
}

export function ReportsIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />
    </Base>
  );
}

export function MessagesIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 6.5h16v10H9l-5 4v-14Z" />
    </Base>
  );
}

export function ShiftsIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function StaffIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <circle cx="12" cy="10.5" r="2.2" />
      <path d="M8.5 16.5c.5-1.8 1.9-2.7 3.5-2.7s3 1 3.5 2.7" />
    </Base>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M15 5l-7 7 7 7" />
    </Base>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </Base>
  );
}

export function PrintIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M7 8V4h10v4" />
      <rect x="4" y="8" width="16" height="9" rx="2" />
      <rect x="7" y="13" width="10" height="7" />
    </Base>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M14 4H6v16h8" />
      <path d="M10 12h11M18 8.5 21.5 12 18 15.5" />
    </Base>
  );
}
