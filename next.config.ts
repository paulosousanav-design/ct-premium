import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    const seguranca = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://viacep.com.br https://brasilapi.com.br",
          "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join('; '),
      },
    ]
    return [
      { source: '/:path*', headers: seguranca },
      { source: '/api/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      { source: '/api/tecnico/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      { source: '/api/consulta/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
    ]
  },
};

export default nextConfig;
