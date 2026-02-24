import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'terms' });

  return {
    title: `${t('title')} — Paperwall`,
    description: t('metaDescription'),
    alternates: {
      canonical: `/${locale === 'en' ? '' : `${locale}/`}terms`,
      languages: {
        'en': '/terms',
        'es': '/es/terms',
        'pt-BR': '/pt/terms',
      },
    },
  };
}

export default async function TermsPage() {
  const t = await getTranslations('terms');

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
        <p className="text-sm text-[var(--muted-foreground)] mb-8">
          {t('lastUpdated')}
        </p>

        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('overviewTitle')}</h2>
            <p className="leading-relaxed">{t('overviewBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('protocolTitle')}</h2>
            <p className="leading-relaxed">{t('protocolBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('walletTitle')}</h2>
            <p className="leading-relaxed">{t('walletBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('paymentsTitle')}</h2>
            <p className="leading-relaxed">{t('paymentsBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('facilitatorTitle')}</h2>
            <p className="leading-relaxed">{t('facilitatorBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('openSourceTitle')}</h2>
            <p className="leading-relaxed">{t('openSourceBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('disclaimerTitle')}</h2>
            <p className="leading-relaxed">{t('disclaimerBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('changesTitle')}</h2>
            <p className="leading-relaxed">{t('changesBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('contactTitle')}</h2>
            <p className="leading-relaxed">{t('contactBody')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
