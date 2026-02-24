import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const FOOTER_LINKS = [
  { key: 'github', href: 'https://github.com/kobaru-io/paperwall' },
  { key: 'chromeExtension', href: 'https://github.com/kobaru-io/paperwall/blob/main/docs/user-guide.md#step-1-install-the-extension' },
  { key: 'npm', href: 'https://www.npmjs.com/package/@kobaru/paperwall' },
] as const;

const INTERNAL_LINKS = [
  { key: 'terms', href: '/terms' },
  { key: 'privacy', href: '/privacy' },
] as const;

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t-4 border-[var(--border)] bg-[var(--muted)] py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <nav aria-label="Footer links">
            <ul className="flex flex-wrap items-center gap-6">
              {FOOTER_LINKS.map(({ key, href }) => (
                <li key={key}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-[var(--foreground)] hover:text-[var(--muted-foreground)] transition-colors"
                  >
                    {t(key)}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="https://kobaru.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-[var(--foreground)] hover:text-[var(--muted-foreground)] transition-colors"
                >
                  {t('kobaru')}
                </a>
              </li>
              {INTERNAL_LINKS.map(({ key, href }) => (
                <li key={key}>
                  <Link
                    href={href}
                    className="text-sm font-bold text-[var(--foreground)] hover:text-[var(--muted-foreground)] transition-colors"
                  >
                    {t(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="text-sm text-[var(--muted-foreground)]">
            {t('copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
