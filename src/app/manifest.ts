import type { MetadataRoute } from 'next';

/**
 * The staff tool installs like an app: Add to Home Screen from the counter
 * phone, tap the Lawmann tile, pick your name, type your PIN. The gate is
 * the start URL — unsigned staff bounce to /app/login, same as the web.
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lawmann Laundry',
    short_name: 'Lawmann',
    description: 'Weigh, price, record, and track every bag, from the hostel to the owner’s phone.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f5f4',
    theme_color: '#115e59',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
