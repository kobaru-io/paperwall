'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from '@/i18n/navigation';
import { CHROME_STORE_URL, FIREFOX_STORE_URL } from '@/lib/constants';

type Browser = 'chrome' | 'firefox' | 'default';

function detectBrowser(): Browser {
  if (typeof navigator === 'undefined') return 'default';
  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Chrome\//i.test(ua)) return 'chrome';
  return 'default';
}

function ChromeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="24" cy="24" r="22" fill="#fff" />
      <path d="M24 2a22 22 0 0 0-19.05 11l8.55 14.8A11 11 0 0 1 24 13h20.78A22 22 0 0 0 24 2Z" fill="#DB4437" />
      <path d="M4.95 13A22 22 0 0 0 15.34 42.6l8.55-14.8A11 11 0 0 1 13.5 20.2L4.95 13Z" fill="#0F9D58" />
      <path d="M15.34 42.6A22 22 0 0 0 44.78 13H27.68a11 11 0 0 1-3.79 14.8l-8.55 14.8Z" fill="#FFCD40" />
      <circle cx="24" cy="24" r="8" fill="#4285F4" />
    </svg>
  );
}

function FirefoxIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="24" cy="24" r="22" fill="#FF9500" />
      <path
        d="M38 14c-1-3-3.5-5.5-5-6.5.8 2 1 3.5.5 5-1.5-3-4-5-7-7.5-.5-.3-1-.7-1-1.2 0-.1 0-.3-.2-.2-.1 0-.2.1-.2.2-2.5 4-1 7.2 0 9.5a10 10 0 0 0-5.5 1C18 14 17 13 16.8 12.5a9 9 0 0 0-2 5c0 .3-.2 2 .5 4A12.5 12.5 0 1 0 38 14Z"
        fill="#FF3750"
      />
      <path
        d="M34 18.5c-.2-.7-1.2-2.2-2-3 0 0-1.2 2-4 3.5a12 12 0 0 1-6 1c5-3 5.5-7 5-9-1.5-3-4-5-7-7.5l-.5-.3c-2.5 4-1 7.2 0 9.5a10 10 0 0 0-5.5 1l-.2.3a9 9 0 0 0-2 5c0 .3-.2 2 .5 4A12.5 12.5 0 0 0 36.5 24c0-2-.8-4-2.5-5.5Z"
        fill="#FF980E"
      />
    </svg>
  );
}

export default function Hero() {
  const t = useTranslations('hero');
  const prefersReduced = useReducedMotion();
  const [browser, setBrowser] = useState<Browser>('default');

  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  const animationProps = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 30 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6 },
      };

  const primaryClass =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-none border-2 border-[var(--border)] bg-[var(--primary)] px-6 text-base font-bold text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] transition-all hover:bg-[var(--primary-hover)] hover:shadow-[6px_6px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sm:w-auto sm:px-8 sm:text-lg';

  const secondaryClass =
    'inline-flex h-12 w-full items-center justify-center rounded-none border-2 border-[var(--border)] bg-transparent px-6 text-base font-bold text-[var(--foreground)] shadow-[4px_4px_0_var(--border)] transition-all hover:bg-[var(--muted)] hover:shadow-[6px_6px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sm:w-auto sm:px-8 sm:text-lg';

  const isSupported = browser === 'chrome' || browser === 'firefox';

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:min-h-[80vh] sm:px-6 sm:py-20">
      <motion.div className="max-w-4xl text-center" {...animationProps}>
        <h1 className="font-[family-name:var(--font-head)] text-3xl leading-tight sm:text-5xl md:text-7xl">
          {t('tagline')}
        </h1>
        <p className="mt-6 text-xl md:text-2xl">{t('subtitle')}</p>

        {isSupported ? (
          <>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={browser === 'chrome' ? CHROME_STORE_URL : FIREFOX_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={primaryClass}
              >
                {browser === 'chrome' ? <ChromeIcon /> : <FirefoxIcon />}
                {browser === 'chrome' ? t('ctaInstallChrome') : t('ctaInstallFirefox')}
                {' \u2197'}
              </a>
              <a
                href="#get-started"
                className={secondaryClass}
              >
                {t('ctaPrimary')}
              </a>
            </div>
            <p className="mt-4">
              <a
                href={browser === 'chrome' ? FIREFOX_STORE_URL : CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--muted-foreground)] hover:underline"
              >
                {browser === 'chrome' ? t('ctaAltFirefox') : t('ctaAltChrome')}
              </a>
            </p>
          </>
        ) : (
          <>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="#get-started"
                className={primaryClass}
              >
                {t('ctaPrimary')}
              </a>
              <Link
                href="/demo"
                className={secondaryClass}
              >
                {t('ctaSecondary')}
              </Link>
            </div>
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              {t.rich('ctaAvailableBoth', {
                chrome: (chunks) => (
                  <a
                    href={CHROME_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[var(--foreground)] hover:underline"
                  >
                    {chunks}
                  </a>
                ),
                firefox: (chunks) => (
                  <a
                    href={FIREFOX_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[var(--foreground)] hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </>
        )}
      </motion.div>
    </section>
  );
}
