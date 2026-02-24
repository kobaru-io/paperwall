import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Script from 'next/script';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return {
    title: 'Live Demo — Try Paperwall Micropayments | Paperwall',
    description: 'See how Paperwall works. Pay a penny to unlock content — no account, no subscription needed. Try the live demo now.',
    alternates: {
      canonical: `${prefix}/demo`,
      languages: {
        'en': '/demo',
        'es': '/es/demo',
        'pt-BR': '/pt/demo',
        'x-default': '/demo',
      },
    },
    openGraph: {
      title: 'Live Demo — Try Paperwall Micropayments | Paperwall',
      description: 'See how Paperwall works. Pay a penny to unlock content — no account, no subscription needed. Try the live demo now.',
      url: `https://www.paperwall.app${prefix}/demo`,
    },
    twitter: {
      title: 'Live Demo — Try Paperwall Micropayments | Paperwall',
      description: 'See how Paperwall works. Pay a penny to unlock content — no account, no subscription needed. Try the live demo now.',
    },
  };
}

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'demo' });

  return (
    <section className="min-h-screen py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-block mb-8 text-[var(--muted-foreground)] font-bold hover:text-[var(--foreground)] transition-colors"
        >
          {t('backHome')}
        </Link>

        <h1 className="text-4xl font-[family-name:var(--font-head)] mb-2">
          {t('title')}
        </h1>
        <p className="text-lg text-[var(--muted-foreground)] mb-8">
          {t('subtitle')}
        </p>

        {/* Install extension callout */}
        <div className="border-2 border-[var(--border)] bg-[var(--muted)] p-4 rounded-none shadow-[4px_4px_0_var(--border)] mb-10 sm:p-6">
          <p className="mb-4 font-bold">{t('installPrompt')}</p>
          <a
            href="https://github.com/kobaru-io/paperwall/blob/main/docs/user-guide.md#step-1-install-the-extension"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 border-2 border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:bg-[var(--primary-hover)] h-12 px-8 text-lg rounded-none"
          >
            {t('installCta')}
          </a>
        </div>

        {/* Article */}
        <article className="border-2 border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] p-5 rounded-none shadow-[4px_4px_0_var(--border)] sm:p-8">
          <h2 className="text-2xl font-[family-name:var(--font-head)] mb-6">
            {t('articleTitle')}
          </h2>

          <p className="mb-4 leading-relaxed">{t('articlePreview')}</p>

          <div id="paperwall-content">
            <p className="mb-4 leading-relaxed">{t('articleBody1')}</p>
            <p className="mb-4 leading-relaxed">{t('articleBody2')}</p>
            <p className="mb-4 leading-relaxed">{t('articleBody3')}</p>
            <p className="leading-relaxed">{t('articleBody4')}</p>
          </div>
        </article>
      </div>

      <Script
        src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
        data-facilitator-url="https://gateway.kobaru.io"
        data-pay-to="0x0000000000000000000000000000000000000000"
        data-price="10000"
        data-network="eip155:324705682"
        strategy="lazyOnload"
      />
    </section>
  );
}
