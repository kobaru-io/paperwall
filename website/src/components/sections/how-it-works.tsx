'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

const STEPS = [
  { num: 1, titleKey: 'step1Title', descKey: 'step1Desc' },
  { num: 2, titleKey: 'step2Title', descKey: 'step2Desc' },
  { num: 3, titleKey: 'step3Title', descKey: 'step3Desc' },
] as const;

export default function HowItWorks() {
  const t = useTranslations('howItWorks');
  const prefersReduced = useReducedMotion();

  return (
    <section id="how-it-works" className="bg-[var(--muted)] px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-16 text-center font-[family-name:var(--font-head)] text-3xl md:text-5xl">
          {t('title')}
        </h2>
        <motion.div
          className="grid gap-8 md:grid-cols-3"
          {...(prefersReduced
            ? {}
            : {
                initial: 'hidden',
                whileInView: 'visible',
                viewport: { once: true, margin: '-50px' },
                variants: {
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.2 } },
                },
              })}
        >
          {STEPS.map(({ num, titleKey, descKey }, i) => (
            <motion.div
              key={num}
              className="relative flex flex-col items-center text-center"
              {...(prefersReduced
                ? {}
                : {
                    variants: {
                      hidden: { opacity: 0, y: 30 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                    },
                  })}
            >
              {/* Connector arrow (desktop only, not on last) */}
              {i < STEPS.length - 1 && (
                <div className="absolute top-8 -right-4 hidden w-8 items-center justify-center text-2xl font-bold text-[var(--border)] md:flex" aria-hidden="true">
                  &rarr;
                </div>
              )}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--card)] font-[family-name:var(--font-head)] text-2xl shadow-[4px_4px_0_var(--border)]">
                {num}
              </div>
              <h3 className="mb-2 font-[family-name:var(--font-head)] text-xl">
                {t(titleKey)}
              </h3>
              <p className="text-base leading-relaxed">{t(descKey)}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
