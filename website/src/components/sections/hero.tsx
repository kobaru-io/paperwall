'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from '@/i18n/navigation';

export default function Hero() {
  const t = useTranslations('hero');
  const prefersReduced = useReducedMotion();

  const animationProps = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 30 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6 },
      };

  return (
    <section className="flex min-h-[80vh] items-center justify-center px-6 py-20">
      <motion.div className="max-w-4xl text-center" {...animationProps}>
        <h1 className="font-[family-name:var(--font-head)] text-5xl leading-tight md:text-7xl">
          {t('tagline')}
        </h1>
        <p className="mt-6 text-xl md:text-2xl">{t('subtitle')}</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#get-started"
            className="inline-flex h-12 items-center justify-center rounded-none border-2 border-[var(--border)] bg-[var(--primary)] px-8 text-lg font-bold text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] transition-all hover:bg-[var(--primary-hover)] hover:shadow-[6px_6px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {t('ctaPrimary')}
          </a>
          <Link
            href="/demo"
            className="inline-flex h-12 items-center justify-center rounded-none border-2 border-[var(--border)] bg-transparent px-8 text-lg font-bold text-[var(--foreground)] shadow-[4px_4px_0_var(--border)] transition-all hover:bg-[var(--muted)] hover:shadow-[6px_6px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
