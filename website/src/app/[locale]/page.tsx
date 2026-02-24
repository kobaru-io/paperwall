import Hero from '@/components/sections/hero';
import Problem from '@/components/sections/problem';
import HowItWorks from '@/components/sections/how-it-works';
import GetStarted from '@/components/sections/get-started';
import Pricing from '@/components/sections/pricing';
import Showcase from '@/components/sections/showcase';
import Kobaru from '@/components/sections/kobaru';
import Contribute from '@/components/sections/contribute';
import FAQ from '@/components/sections/faq';

export default function Home() {
  return (
    <>
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
