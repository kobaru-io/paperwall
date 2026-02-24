import Hero from '@/components/sections/hero';
import Problem from '@/components/sections/problem';
import HowItWorks from '@/components/sections/how-it-works';
import GetStarted from '@/components/sections/get-started';
import Pricing from '@/components/sections/pricing';
import Showcase from '@/components/sections/showcase';
import Kobaru from '@/components/sections/kobaru';
import Contribute from '@/components/sections/contribute';
import FAQ from '@/components/sections/faq';
import FaqJsonLd from '@/components/faq-json-ld';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <>
      <FaqJsonLd locale={locale} />
      <Hero />
      <Problem />
      <HowItWorks />
      <GetStarted />
      <Pricing />
      <Showcase />
      <Kobaru />
      <Contribute />
      <FAQ />
    </>
  );
}
