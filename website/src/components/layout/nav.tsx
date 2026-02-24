'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from './language-switcher';

const NAV_LINKS = [
  { key: 'howItWorks', href: '/#how-it-works' },
  { key: 'getStarted', href: '/#get-started' },
  { key: 'pricing', href: '/#pricing' },
  { key: 'showcase', href: '/#showcase' },
  { key: 'faq', href: '/#faq' },
] as const;

export function Nav() {
  const t = useTranslations('nav');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 right-0 left-0 z-50 border-b-4 border-[var(--primary-hover)] bg-[var(--primary)]"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <Image
            src="/logo.png"
            alt="Paperwall"
            width={320}
            height={58}
            priority
          />
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(({ key, href }) => (
            <li key={key}>
              <Link
                href={href}
                className="text-base font-bold text-[var(--primary-foreground)] hover:opacity-80 transition-colors"
              >
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop right section */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <Link href="/demo">
            <Button variant="accent" size="md">{t('tryDemo')}</Button>
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="font-bold text-sm border-2 border-[var(--primary-foreground)] rounded-none px-3 py-1 text-[var(--primary-foreground)] md:hidden"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          <span aria-hidden="true">{menuOpen ? '\u2715' : '\u2630'}</span>
          <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="border-t-2 border-[var(--primary-hover)] bg-[var(--primary)] px-4 pb-4 md:hidden"
        >
          <ul className="flex flex-col gap-3 pt-3">
            {NAV_LINKS.map(({ key, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="block text-sm font-bold text-[var(--primary-foreground)] hover:opacity-80"
                  onClick={() => setMenuOpen(false)}
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/demo">
              <Button variant="accent" size="sm">{t('tryDemo')}</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
