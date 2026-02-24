export default function JsonLd({ locale }: { readonly locale: string }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Paperwall',
    description:
      'Micropayments for the open web. Pay a penny to read an article — no subscriptions, no ads, no tracking.',
    url: 'https://paperwall.app',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, Chrome',
    inLanguage: locale,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free and open source',
    },
    author: {
      '@type': 'Organization',
      name: 'Kobaru',
      url: 'https://kobaru.io',
    },
    license: 'https://opensource.org/licenses/GPL-3.0',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
