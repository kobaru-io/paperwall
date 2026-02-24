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
    },
  };
}

export default function SetupPage() {
  return <SetupForm />;
}
