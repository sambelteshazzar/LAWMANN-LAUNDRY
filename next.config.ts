import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite is a WASM package: Node must load it natively, never bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  serverActions: { bodySizeLimit: '2mb' },
};

export default nextConfig;
