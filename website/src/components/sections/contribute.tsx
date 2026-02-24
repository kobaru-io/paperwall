'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

export default function Contribute() {
  const t = useTranslations('contribute');
  const prefersReduced = useReducedMotion();

  const anim = (delay = 0) =>
    prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-40px' },
          transition: { duration: 0.4, delay },
        };

  const stats = [
    { label: t('stats1'), icon: '🔓' },
    { label: t('stats2'), icon: '⚖️' },
    { label: t('stats3'), icon: '🖥️' },
  ];

  return (
    <section className="border-t-4 border-[var(--border)] bg-[var(--primary)]">
      <div className="mx-auto max-w-6xl">

        {/* Main content row */}
        <div className="grid grid-cols-1 md:grid-cols-2">

          {/* Left — text */}
          <motion.div
            className="border-b-4 border-[var(--border)] p-6 text-[var(--primary-foreground)] sm:p-10 md:border-b-0 md:border-r-4"
            {...anim(0)}
          >
            <p className="mb-4 text-sm font-bold uppercase tracking-widest opacity-60">
              Open Source
            </p>
            <h2 className="mb-5 font-[family-name:var(--font-head)] text-3xl leading-tight md:text-5xl">
              {t('title')}
            </h2>
            <p className="mb-3 text-lg opacity-70">{t('subtitle')}</p>
            <p className="mb-8 text-base leading-relaxed opacity-60">{t('body')}</p>
            <a
              href="https://github.com/kobaru-io/paperwall/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-2 border-[var(--primary-foreground)]
                         bg-[var(--accent)] px-6 py-3 font-bold text-[var(--accent-foreground)]
                         shadow-[4px_4px_0_rgba(255,255,255,0.2)] transition-all
                         hover:shadow-[6px_6px_0_rgba(255,255,255,0.2)]
                         active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {t('cta')} ↗
            </a>
          </motion.div>

          {/* Right — stats */}
          <motion.div
            className="flex flex-col justify-center divide-y-4 divide-[var(--border)]"
            {...anim(0.1)}
          >
            {stats.map(({ label, icon }, i) => (
              <div
                key={i}
                className="flex items-center gap-5 px-5 py-6 text-[var(--primary-foreground)] sm:px-10 sm:py-8"
              >
                <span className="text-3xl" aria-hidden="true">{icon}</span>
                <span className="font-[family-name:var(--font-head)] text-2xl">{label}</span>
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </section>
  );
}
