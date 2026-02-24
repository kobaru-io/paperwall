'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import featuredProjects from '@/data/featured-projects.json';

interface FeaturedProject {
  readonly name: string;
  readonly url: string;
  readonly description: string;
}

export default function Showcase() {
  const t = useTranslations('showcase');
  const projects = featuredProjects as readonly FeaturedProject[];
  const prefersReduced = useReducedMotion();

  const cardAnimation = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        transition: { duration: 0.5 },
        viewport: { once: true },
      };

  return (
    <section id="showcase" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-12 text-center font-[family-name:var(--font-head)] text-3xl md:text-5xl">
          {t('title')}
        </h2>

        {projects.length === 0 ? (
          <motion.div
            className="mx-auto max-w-lg rounded-none border-2 border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-[4px_4px_0_var(--border)]"
            {...cardAnimation}
          >
            <h3 className="mb-3 font-[family-name:var(--font-head)] text-2xl">
              {t('emptyTitle')}
            </h3>
            <p className="mb-6 text-base">{t('emptyDesc')}</p>
            <a
              href="https://github.com/kobaru-io/paperwall/issues"
              className="inline-flex h-10 items-center justify-center rounded-none border-2 border-[var(--border)] bg-[var(--primary)] px-5 font-bold text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] transition-all hover:shadow-[6px_6px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {t('emptyCta')}
            </a>
          </motion.div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <motion.a
                key={project.url}
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-none border-2 border-[var(--border)] bg-[var(--card)] p-6 shadow-[4px_4px_0_var(--border)] transition-all hover:shadow-[6px_6px_0_var(--border)]"
                {...cardAnimation}
              >
                <h3 className="mb-2 font-[family-name:var(--font-head)] text-lg">
                  {project.name}
                </h3>
                <p className="text-sm">{project.description}</p>
              </motion.a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
