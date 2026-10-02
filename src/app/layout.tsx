import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Playfair_Display, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brand',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  style: ['normal', 'italic'],
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: { default: 'Lawmann Laundry', template: '%s · Lawmann Laundry' },
  description: 'Weigh, price, record, and track every bag, from the hostel to the owner’s phone.',
  applicationName: 'Lawmann Laundry',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Lawmann Laundry' },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const, themeColor: '#115e59' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${playfair.variable} ${sourceSans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
