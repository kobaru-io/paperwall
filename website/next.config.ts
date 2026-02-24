import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: process.cwd(),
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/((?!_next|api|.*\\..*).*)',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
