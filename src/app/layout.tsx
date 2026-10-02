import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Lawmann Laundry', template: '%s · Lawmann Laundry' },
  description: 'Weigh, price, record, and track every bag — from the hostel to the owner’s phone.',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const, themeColor: '#115e59' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
