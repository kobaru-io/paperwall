import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-5xl font-[family-name:var(--font-head)] mb-4">
          {t('title')}
        </h1>
        <p className="text-lg text-[var(--muted-foreground)] mb-8">
          {t('description')}
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 border-2 border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:bg-[var(--primary-hover)] h-12 px-8 text-lg rounded-none"
        >
          {t('backHome')}
        </Link>
      </div>
    </section>
  );
}
