/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,

  // Silence the workspace root warning (multiple lockfiles in monorepo)
  outputFileTracingRoot: '/Users/solminde/Developer/Personal/SIH(2026)',

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
