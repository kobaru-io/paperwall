import type { MetadataRoute } from 'next';

const PAGE_LAST_MODIFIED: Record<string, string> = {
  '': '2026-02-24',
  '/demo': '2026-02-24',
  '/setup': '2026-02-24',
  '/terms': '2026-02-01',
  '/privacy': '2026-02-01',
};

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.paperwall.app';
  const locales = ['en', 'es', 'pt'];
  const pages = ['', '/demo', '/setup', '/terms', '/privacy'];

  const entries: MetadataRoute.Sitemap = [];

  for (const page of pages) {
    for (const locale of locales) {
      const prefix = locale === 'en' ? '' : `/${locale}`;
      entries.push({
        url: `${baseUrl}${prefix}${page}`,
        lastModified: new Date(PAGE_LAST_MODIFIED[page] ?? '2026-01-01'),
        changeFrequency: page === '' ? 'weekly' : 'monthly',
        priority: page === '' ? 1.0 : ['/terms', '/privacy'].includes(page) ? 0.3 : 0.8,
      });
    }
  }

  return entries;
}
