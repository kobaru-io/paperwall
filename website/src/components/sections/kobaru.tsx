'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

export default function Kobaru() {
  const t = useTranslations('kobaru');
  const prefersReduced = useReducedMotion();

  return (
    <section className="bg-[var(--muted)] px-6 py-20">
      <motion.div
        className="mx-auto max-w-3xl text-center"
        {...(prefersReduced
          ? {}
          : {
              initial: { opacity: 0, y: 20 },
              whileInView: { opacity: 1, y: 0 },
              transition: { duration: 0.5 },
              viewport: { once: true },
            })}
      >
        <h2 className="mb-6 font-[family-name:var(--font-head)] text-3xl md:text-4xl">
          {t('title')}
        </h2>
        <p className="mb-8 text-lg leading-relaxed">{t('description')}</p>
        <a
          href="https://kobaru.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-none border-2 border-[var(--border)] bg-[var(--primary)] px-5 font-bold text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] transition-all hover:shadow-[6px_6px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {t('cta')}
        </a>
      </motion.div>
    </section>
  );
}
