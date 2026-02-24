'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

const FAQ_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export default function FAQ() {
  const t = useTranslations('faq');
  const [openItems, setOpenItems] = useState<Set<number>>(() => new Set());
  const prefersReduced = useReducedMotion();

  const toggle = useCallback((index: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  return (
    <section id="faq" className="px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-12 text-center font-[family-name:var(--font-head)] text-3xl md:text-5xl">
          {t('title')}
        </h2>
        <div className="flex flex-col gap-4">
          {FAQ_KEYS.map((num) => {
            const isOpen = openItems.has(num);
            return (
              <div
                key={num}
                className="rounded-none border-2 border-[var(--border)] bg-[var(--card)] shadow-[4px_4px_0_var(--border)]"
              >
                <button
                  type="button"
                  id={`faq-question-${num}`}
                  className="flex w-full items-center justify-between p-5 text-left font-bold"
                  onClick={() => toggle(num)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${num}`}
                >
                  <span>{t(`q${num}` as `q1`)}</span>
                  <span
                    className="ml-4 shrink-0 text-xl transition-transform"
                    style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
                <motion.div
                  id={`faq-answer-${num}`}
                  role="region"
                  aria-labelledby={`faq-question-${num}`}
                  initial={false}
                  animate={{
                    height: isOpen ? 'auto' : 0,
                    opacity: isOpen ? 1 : 0,
                  }}
                  transition={{ duration: prefersReduced ? 0 : 0.25 }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 leading-relaxed">
                    {t(`a${num}` as `a1`)}
                  </p>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
