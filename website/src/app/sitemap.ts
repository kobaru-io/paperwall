import type { MetadataRoute } from 'next';

export const revalidate = 3600;

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
        lastModified: new Date(),
        changeFrequency: page === '' ? 'weekly' : 'monthly',
        priority: page === '' ? 1.0 : 0.8,
      });
    }
  }

  return entries;
}
