import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite is a large WASM bundle and is only ever used server-side.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
