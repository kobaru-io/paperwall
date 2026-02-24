'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  'es': 'ES',
  'pt': 'PT',
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(
      { pathname },
      { locale: e.target.value },
    );
  }

  return (
    <select
      value={locale}
      onChange={handleChange}
      aria-label="Select language"
      className="h-8 rounded-none border-2 border-[var(--border)] bg-[var(--card)] px-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
    >
      {Object.entries(LOCALE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
