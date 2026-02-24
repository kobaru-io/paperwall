import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacy' });

  return {
    title: `${t('title')} — Paperwall`,
    description: t('metaDescription'),
    alternates: {
      canonical: `/${locale === 'en' ? '' : `${locale}/`}privacy`,
      languages: {
        'en': '/privacy',
        'es': '/es/privacy',
        'pt-BR': '/pt/privacy',
      },
    },
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');

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
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('extensionTitle')}</h2>
            <p className="leading-relaxed">{t('extensionBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('agentTitle')}</h2>
            <p className="leading-relaxed">{t('agentBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('websiteTitle')}</h2>
            <p className="leading-relaxed">{t('websiteBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('blockchainTitle')}</h2>
            <p className="leading-relaxed">{t('blockchainBody')}</p>
          </div>

          <div>
            <h2 className="text-2xl font-[family-name:var(--font-head)] mb-3">{t('thirdPartyTitle')}</h2>
            <p className="leading-relaxed">{t('thirdPartyBody')}</p>
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
