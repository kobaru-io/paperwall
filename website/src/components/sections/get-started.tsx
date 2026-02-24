'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

export default function GetStarted() {
  const t = useTranslations('getStarted');
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

  return (
    <section id="get-started" className="border-t-4 border-[var(--border)] bg-[var(--card)] px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">

        {/* Section heading — outside the bento */}
        <motion.div className="mb-10" {...anim(0)}>
          <h2 className="font-[family-name:var(--font-head)] text-4xl md:text-6xl">
            {t('title')}
          </h2>
          <p className="mt-3 text-lg text-[var(--muted-foreground)]">{t('subtitle')}</p>
        </motion.div>

        {/*
          Asymmetric bento: 3 columns
          ┌──────────────────┬───────────┐
          │  Publishers      │           │
          │  (col 1-2, row1) │  Readers  │
          ├──────────┬───────┤  (col 3,  │
          │ AI Users │  Dev  │  row 1-2) │
          │ (col 1)  │(col 2)│           │
          └──────────┴───────┴───────────┘
        */}
        <div
          className="grid grid-cols-1 gap-0 border-2 border-[var(--border)]
                     md:grid-cols-3 md:grid-rows-2"
        >
          {/* Publishers — wide, top-left (spans 2 cols) */}
          <motion.div
            className="flex flex-col justify-between border-b-2 border-[var(--border)]
                       bg-[var(--primary)] p-5 text-[var(--primary-foreground)] sm:p-8
                       md:col-span-2 md:border-b-2 md:border-r-2"
            {...anim(0.05)}
          >
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-widest opacity-60">
                For Publishers
              </p>
              <h3 className="mb-4 font-[family-name:var(--font-head)] text-3xl md:text-4xl leading-tight">
                {t('publisherTitle')}
              </h3>
              <p className="mb-6 max-w-lg text-base leading-relaxed opacity-80">
                {t('publisherDesc')}
              </p>
              <pre className="mb-6 max-w-lg overflow-x-auto break-all whitespace-pre-wrap border border-white/20 bg-white/10 p-3 text-xs font-bold">
                <code>{'<script src="https://paperwall.app/publisher-sdk.js"></script>'}</code>
              </pre>
            </div>
            <div>
              <a
                href="/setup"
                className="inline-flex items-center gap-2 border-2 border-[var(--primary-foreground)]
                           bg-[var(--accent)] px-5 py-2.5 font-bold text-[var(--accent-foreground)]
                           shadow-[4px_4px_0_rgba(255,255,255,0.2)] transition-all
                           hover:shadow-[6px_6px_0_rgba(255,255,255,0.2)]
                           active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {t('publisherCta')} ↗
              </a>
            </div>
          </motion.div>

          {/* Readers — tall right column, spans 2 rows */}
          <motion.div
            className="flex flex-col justify-between border-b-2 border-[var(--border)]
                       bg-[var(--muted)] p-5 text-[var(--foreground)] sm:p-8
                       md:row-span-2 md:border-b-0"
            {...anim(0.1)}
          >
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-widest opacity-50">
                For Readers
              </p>
              <h3 className="mb-4 font-[family-name:var(--font-head)] text-3xl md:text-4xl leading-tight">
                {t('readerTitle')}
              </h3>
              <p className="mb-6 text-base leading-relaxed text-[var(--muted-foreground)]">
                {t('readerDesc')}
              </p>
            </div>
            <div>
              <a
                href="https://github.com/kobaru-io/paperwall/blob/main/docs/user-guide.md#step-1-install-the-extension"
                className="inline-flex items-center gap-2 border-2 border-[var(--border)]
                           bg-[var(--primary)] px-5 py-2.5 font-bold text-[var(--primary-foreground)]
                           shadow-[4px_4px_0_var(--border)] transition-all
                           hover:shadow-[6px_6px_0_var(--border)]
                           active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {t('readerCta')} ↗
              </a>
            </div>
          </motion.div>

          {/* AI Agent Users — bottom-left */}
          <motion.div
            className="flex flex-col justify-between border-b-2 border-[var(--border)]
                       bg-[var(--card)] p-5 text-[var(--foreground)] sm:p-8
                       md:border-b-0 md:border-r-2"
            {...anim(0.15)}
          >
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-widest opacity-40">
                For AI Users
              </p>
              <h3 className="mb-3 font-[family-name:var(--font-head)] text-2xl leading-tight">
                {t('agentUserTitle')}
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
                {t('agentUserDesc')}
              </p>
            </div>
            <div>
              <a
                href="https://github.com/kobaru-io/paperwall/blob/main/docs/mcp-server-guide.md"
                className="inline-flex items-center gap-2 border-2 border-[var(--border)]
                           bg-[var(--foreground)] px-4 py-2 text-sm font-bold text-[var(--card)]
                           shadow-[4px_4px_0_var(--border)] transition-all
                           hover:shadow-[6px_6px_0_var(--border)]
                           active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {t('agentUserCta')} ↗
              </a>
            </div>
          </motion.div>

          {/* Developers — bottom-right of left 2 cols */}
          <motion.div
            className="flex flex-col justify-between
                       bg-[var(--accent)] p-5 text-[var(--accent-foreground)] sm:p-8"
            {...anim(0.2)}
          >
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-widest opacity-50">
                For Developers
              </p>
              <h3 className="mb-3 font-[family-name:var(--font-head)] text-2xl leading-tight">
                {t('agentDevTitle')}
              </h3>
              <p className="mb-6 text-sm leading-relaxed opacity-70">
                {t('agentDevDesc')}
              </p>
            </div>
            <div>
              <a
                href="https://github.com/kobaru-io/paperwall/blob/main/docs/agent-cli-guide.md"
                className="inline-flex items-center gap-2 border-2 border-[var(--accent-foreground)]
                           bg-[var(--accent-foreground)] px-4 py-2 text-sm font-bold text-[var(--accent)]
                           shadow-[4px_4px_0_rgba(0,0,0,0.2)] transition-all
                           hover:shadow-[6px_6px_0_rgba(0,0,0,0.2)]
                           active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {t('agentDevCta')} ↗
              </a>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
