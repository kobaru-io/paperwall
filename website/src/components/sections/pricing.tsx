'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

export default function Pricing() {
  const t = useTranslations('pricing');
  const prefersReduced = useReducedMotion();

  const anim = (dir: 'left' | 'right') =>
    prefersReduced
      ? {}
      : {
          initial: { opacity: 0, x: dir === 'left' ? -20 : 20 },
          whileInView: { opacity: 1, x: 0 },
          transition: { duration: 0.5 },
          viewport: { once: true },
        };

  return (
    <section id="pricing" className="border-t-4 border-[var(--border)] bg-[var(--muted)] px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-2 text-center font-[family-name:var(--font-head)] text-3xl md:text-5xl">
          {t('title')}
        </h2>
        <p className="mb-12 text-center text-lg text-[var(--muted-foreground)]">{t('comparison')}</p>

        {/* Comparison cards */}
        <div className="mb-10 grid gap-0 md:grid-cols-2">
          {/* Subscriptions */}
          <motion.div
            className="border-2 border-[var(--border)] bg-[var(--card)] p-8 shadow-[4px_4px_0_var(--border)] md:-mr-[2px]"
            {...anim('left')}
          >
            <h3 className="mb-4 font-[family-name:var(--font-head)] text-xl text-[var(--muted-foreground)]">
              {t('subModel')}
            </h3>
            <p className="mb-2 font-[family-name:var(--font-head)] text-5xl line-through decoration-[var(--destructive)] decoration-2">
              {t('subPrice')}
            </p>
            <p className="text-base text-[var(--muted-foreground)]">{t('subNote')}</p>
          </motion.div>

          {/* Paperwall */}
          <motion.div
            className="border-2 border-[var(--border)] bg-[var(--primary)] p-8 shadow-[4px_4px_0_var(--border)] text-[var(--primary-foreground)]"
            {...anim('right')}
          >
            <h3 className="mb-4 font-[family-name:var(--font-head)] text-xl opacity-70">
              {t('pwModel')}
            </h3>
            <p className="mb-2 font-[family-name:var(--font-head)] text-5xl">
              {t('pwPrice')}
            </p>
            <p className="text-base font-bold text-[var(--accent)]">{t('pwNote')}</p>
          </motion.div>
        </div>

        {/* Three clarifying notes */}
        <motion.div
          className="grid gap-0 border-2 border-[var(--border)] md:grid-cols-3"
          {...(prefersReduced ? {} : {
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            transition: { duration: 0.4, delay: 0.2 },
            viewport: { once: true },
          })}
        >
          {[
            { icon: '⚙️', text: t('protocolNote') },
            { icon: '📖', text: t('readerNote') },
            { icon: '</>', text: t('publisherNote') },
          ].map(({ icon, text }, i) => (
            <div
              key={i}
              className={[
                'bg-[var(--card)] p-6',
                i < 2 ? 'border-b-2 border-[var(--border)] md:border-b-0 md:border-r-2' : '',
              ].join(' ')}
            >
              <div className="mb-3 text-2xl">{icon}</div>
              <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">{text}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
