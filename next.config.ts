import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const api = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inMonorepo = fs.existsSync(path.join(root, 'pnpm-workspace.yaml'));

// Demo build: no API, no login. The app answers its own /api calls in the browser (see docs/DEMO.md).
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const nextConfig: NextConfig = {
  // The Docker image runs the standalone server; a demo build is deployed as a plain Next.js app.
  ...(demo ? {} : { output: 'standalone' as const }),
  // monorepo: trace from the workspace root so standalone output lands in apps/web/
  ...(inMonorepo ? { outputFileTracingRoot: root } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  // In docker the Caddy proxy routes /api, /socket.io, /webhooks and /widget.js to the API.
  // These rewrites make `pnpm dev` work without the proxy.
  async rewrites() {
    if (demo) return [];
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/webhooks/:path*', destination: `${api}/webhooks/:path*` },
      { source: '/widget.js', destination: `${api}/widget.js` },
    ];
  },
  async redirects() {
    if (!demo) return [];
    // The persona picker stands in for sign-in, and nothing may reach a server that is not there.
    return [
      { source: '/', destination: '/demo', permanent: false },
      { source: '/login', destination: '/demo', permanent: false },
      { source: '/forgot', destination: '/demo', permanent: false },
      { source: '/api/:path*', destination: '/demo?unavailable=1', permanent: false },
      { source: '/widget.js', destination: '/demo?unavailable=1', permanent: false },
    ];
  },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/widget/:path*', headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }] },
      {
        source: '/((?!widget).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
