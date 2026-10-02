import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite is a WASM package: Node must load it natively, never bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  // The boot sequence reads migrations and triggers from disk at runtime;
  // serverless bundling must not drop them (drizzle/*.sql, triggers.sql).
  outputFileTracingIncludes: {
    '/**': ['./drizzle/**/*', './src/lib/db/triggers.sql'],
  },
};

export default nextConfig;
