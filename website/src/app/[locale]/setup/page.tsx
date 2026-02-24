import type { Metadata } from 'next';
import SetupForm from './setup-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return {
    title: 'Publisher Setup — Add Micropayments in One Line | Paperwall',
    description: 'Add the Paperwall script tag to your site and start earning micropayments. Free setup, no subscription required.',
    alternates: {
      canonical: `${prefix}/setup`,
      languages: {
        'en': '/setup',
        'es': '/es/setup',
        'pt-BR': '/pt/setup',
        'x-default': '/setup',
      },
    },
    openGraph: {
      title: 'Publisher Setup — Add Micropayments in One Line | Paperwall',
      description: 'Add the Paperwall script tag to your site and start earning micropayments. Free setup, no subscription required.',
      url: `https://www.paperwall.app${prefix}/setup`,
    },
    twitter: {
      title: 'Publisher Setup — Add Micropayments in One Line | Paperwall',
      description: 'Add the Paperwall script tag to your site and start earning micropayments. Free setup, no subscription required.',
    },
  };
}

export default function SetupPage() {
  return <SetupForm />;
}
