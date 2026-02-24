import type { Metadata } from 'next';
import { Archivo_Black, Space_Grotesk } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Nav } from '@/components/layout/nav';
import { Footer } from '@/components/layout/footer';
import JsonLd from '@/components/json-ld';
import '../globals.css';

const archivoBlack = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-head',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const localeMap: Record<string, string> = {
  'en': 'en_US',
  'es': 'es_MX',
  'pt': 'pt_BR',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: t('title'),
    description: t('description'),
    metadataBase: new URL('https://www.paperwall.app'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${locale === 'en' ? '' : locale}`,
      languages: {
        'en': '/',
        'es': '/es',
        'pt': '/pt',
        'x-default': '/',
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `https://www.paperwall.app/${locale === 'en' ? '' : locale}`,
      siteName: 'Paperwall',
      locale: localeMap[locale] || 'en_US',
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@GoKobaru',
      creator: '@GoKobaru',
      title: t('title'),
      description: t('description'),
      images: ['/og-image.png'],
    },
    other: {
      'profile:bluesky': 'https://bsky.app/profile/kobaru.io',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${archivoBlack.variable} ${spaceGrotesk.variable} scroll-smooth`}>
      <body className="bg-[var(--background)] text-[var(--foreground)] font-[family-name:var(--font-sans)]">
        <JsonLd locale={locale} />
        <NextIntlClientProvider messages={messages}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-none focus:border-2 focus:border-[var(--border)] focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:font-bold focus:text-[var(--primary-foreground)] focus:shadow-[4px_4px_0_var(--border)]"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main-content" className="pt-16 md:pt-24">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
