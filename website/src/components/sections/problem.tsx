'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

const CARDS = [
  { key: 'publisher', bg: 'bg-[var(--primary)]', text: 'text-[var(--primary-foreground)]' },
  { key: 'reader', bg: 'bg-[var(--secondary)]', text: 'text-[var(--secondary-foreground)]' },
  { key: 'agentUser', bg: 'bg-[var(--accent)]', text: 'text-[var(--accent-foreground)]' },
  { key: 'agent', bg: 'bg-[var(--muted)]', text: 'text-[var(--foreground)]' },
] as const;

export default function Problem() {
  const t = useTranslations('problem');
  const prefersReduced = useReducedMotion();

  return (
    <section className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-12 text-center font-[family-name:var(--font-head)] text-3xl md:text-5xl">
          {t('title')}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {CARDS.map(({ key, bg, text }, i) => (
            <motion.div
              key={key}
              className={`${bg} ${text} rounded-none border-2 border-[var(--border)] p-6 shadow-[4px_4px_0_var(--border)]`}
              {...(prefersReduced
                ? {}
                : {
                    initial: { opacity: 0, y: 30 },
                    whileInView: { opacity: 1, y: 0 },
                    transition: { duration: 0.5, delay: i * 0.1 },
                    viewport: { once: true, margin: '-50px' },
                  })}
            >
              <h3 className="mb-2 text-xl font-bold">{t(`${key}Title`)}</h3>
              <p className="text-base leading-relaxed opacity-90">{t(`${key}Desc`)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
