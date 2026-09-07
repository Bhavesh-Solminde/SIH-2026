import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,

  // Silence the workspace root warning (multiple lockfiles in monorepo).
  // Computed, not hardcoded — a literal absolute path only exists on the
  // machine that wrote it and silently stops doing anything on a build server.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),

  // Proxy /api/* → Express on :4000 — same-origin from browser POV, no CORS.
  // Next.js rewrites forward all headers including Cookie automatically.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
