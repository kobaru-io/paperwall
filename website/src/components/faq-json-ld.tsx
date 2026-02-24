import { getTranslations } from 'next-intl/server';

export default async function FaqJsonLd({ locale }: { readonly locale: string }) {
  const t = await getTranslations({ locale, namespace: 'faq' });

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: keys.map((n) => ({
      '@type': 'Question',
      name: t(`q${n}` as 'q1'),
      acceptedAnswer: {
        '@type': 'Answer',
        text: t(`a${n}` as 'a1'),
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
