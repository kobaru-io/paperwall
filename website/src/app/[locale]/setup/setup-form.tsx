'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// -- Types ---

type Mode = 'client' | 'server';

interface Config {
  walletAddress: string;
  priceUsd: string;
  mode: Mode;
  optimistic: boolean;
  paymentUrl: string;
}

// -- Constants ---

// Switch to jsDelivr once @paperwall/sdk is published to npm:
// https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js
const SDK_URL =
  process.env.NEXT_PUBLIC_SDK_URL ??
  'https://paperwall.app/publisher-sdk.js';

// -- Helpers ---

const PRICE_PRESETS = [
  { label: '$0.01', value: '0.01' },
  { label: '$0.05', value: '0.05' },
  { label: '$0.10', value: '0.10' },
  { label: '$0.25', value: '0.25' },
  { label: '$0.50', value: '0.50' },
  { label: '$1.00', value: '1.00' },
];

function toMicroUnits(usd: string): string {
  const n = parseFloat(usd);
  if (isNaN(n) || n <= 0) return '10000';
  return Math.round(n * 1_000_000).toString();
}

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function buildScriptTag(cfg: Config): string {
  const price = toMicroUnits(cfg.priceUsd);
  const addr = cfg.walletAddress || 'YOUR_WALLET_ADDRESS';
  const lines = [
    `<script src="${SDK_URL}"`,
    `  data-facilitator-url="https://gateway.kobaru.io"`,
    `  data-pay-to="${addr}"`,
    `  data-price="${price}"`,
    `  data-network="eip155:324705682"`,
  ];
  if (cfg.mode === 'server') {
    lines.push(`  data-mode="server"`);
    lines.push(`  data-payment-url="${cfg.paymentUrl || 'https://yoursite.com/api/paperwall-payment'}"`);
  }
  if (!cfg.optimistic) {
    lines.push(`  data-optimistic="false"`);
  }
  lines.push(`></script>`);
  return lines.join('\n');
}

// -- Platform instructions ---

const PLATFORMS = [
  {
    icon: '🔵',
    name: 'WordPress',
    steps: [
      'Go to <strong>Appearance → Theme File Editor</strong> (or use a child theme)',
      'Open <code class="font-mono text-xs">footer.php</code> and paste just before <code class="font-mono text-xs">&lt;/body&gt;</code>',
      'Alternatively, install the <strong>Insert Headers and Footers</strong> plugin and paste in the Footer Scripts box',
    ],
    tip: 'Using a page builder like Elementor or Divi? Look for a "Custom Code" or "Code Snippet" widget to add it per-page.',
  },
  {
    icon: '👻',
    name: 'Ghost',
    steps: [
      'Go to <strong>Settings → Code injection</strong>',
      'Paste the code in the <strong>Site Footer</strong> box',
      'Click Save — it applies to all posts automatically',
    ],
    tip: 'To paywall only specific posts, use Ghost\'s built-in member access tiers alongside Paperwall.',
  },
  {
    icon: '🟧',
    name: 'Squarespace',
    steps: [
      'Go to <strong>Settings → Advanced → Code Injection</strong>',
      'Paste in the <strong>Footer</strong> section',
      'Click Save',
    ],
    tip: 'Squarespace only allows code injection on Business plan and above.',
  },
  {
    icon: '🌊',
    name: 'Webflow',
    steps: [
      'Open your project in the Designer',
      'Go to <strong>Page Settings</strong> for the page you want to paywall',
      'Paste in the <strong>Before &lt;/body&gt; tag</strong> field',
      'Publish the site',
    ],
    tip: 'Use Webflow\'s CMS collection page settings to apply it to all blog posts at once.',
  },
  {
    icon: '📄',
    name: 'Plain HTML',
    steps: [
      'Open your <code class="font-mono text-xs">.html</code> file in any editor',
      'Find the closing <code class="font-mono text-xs">&lt;/body&gt;</code> tag',
      'Paste the code immediately before it',
      'Save and upload to your server',
    ],
    tip: 'Place it as the last script on the page so it doesn\'t block rendering.',
  },
  {
    icon: '⚡',
    name: 'Next.js / React',
    steps: [
      'Add the script tag in your <code class="font-mono text-xs">_document.tsx</code> inside <code class="font-mono text-xs">&lt;body&gt;</code>, or',
      'Use Next.js <code class="font-mono text-xs">&lt;Script strategy="beforeInteractive"&gt;</code> in your layout',
      'Pass data attributes as props on the Script component',
    ],
    tip: 'For per-page pricing, render the script conditionally based on your route or CMS content type.',
  },
];

// -- Component ---

export default function SetupForm() {
  const t = useTranslations('setup');

  const [config, setConfig] = useState<Config>({
    walletAddress: '',
    priceUsd: '0.01',
    mode: 'client',
    optimistic: true,
    paymentUrl: '',
  });

  const [copied, setCopied] = useState(false);
  const [customPrice, setCustomPrice] = useState(false);

  const code = buildScriptTag(config);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const set = (partial: Partial<Config>) =>
    setConfig((prev) => ({ ...prev, ...partial }));

  const addressValid = config.walletAddress === '' || isValidAddress(config.walletAddress);

  return (
    <div className="min-h-screen bg-[var(--background)]">

      {/* Page header */}
      <div className="border-b-4 border-[var(--border)] bg-[var(--primary)] px-4 py-8 text-[var(--primary-foreground)] sm:px-6 sm:py-10">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-4 inline-block text-sm font-bold opacity-60 hover:opacity-100">
            {t('backHome')}
          </Link>
          <h1 className="font-[family-name:var(--font-head)] text-3xl sm:text-4xl md:text-6xl">
            {t('pageTitle')}
          </h1>
          <p className="mt-3 max-w-xl text-lg opacity-70">
            {t('pageSubtitle')}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">

          {/* Left — form */}
          <div className="border-2 border-[var(--border)] bg-[var(--card)] p-4 shadow-[6px_6px_0_var(--border)] sm:p-8 md:border-r-0">

            {/* Wallet address */}
            <div className="mb-8">
              <label className="mb-2 block font-bold" htmlFor="wallet">
                {t('walletLabel')}
              </label>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                {t('walletHint')} <code className="font-bold">0x</code>.{' '}
                {t('walletNoWallet')}{' '}
                <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer" className="underline">
                  Coinbase Wallet ↗
                </a>
                {' '}{t('walletOr')}{' '}
                <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="underline">
                  MetaMask ↗
                </a>
              </p>
              <input
                id="wallet"
                type="text"
                placeholder={t('walletPlaceholder')}
                value={config.walletAddress}
                onChange={(e) => set({ walletAddress: e.target.value })}
                className={[
                  'w-full border-2 bg-[var(--background)] px-4 py-3 font-mono text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
                  !addressValid ? 'border-[var(--destructive)]' : 'border-[var(--border)]',
                ].join(' ')}
              />
              {!addressValid && (
                <p className="mt-1 text-xs text-[var(--destructive)]">{t('walletError')}</p>
              )}
            </div>

            {/* Price */}
            <div className="mb-8">
              <label className="mb-2 block font-bold">{t('priceLabel')}</label>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('priceHint')}</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {PRICE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { set({ priceUsd: p.value }); setCustomPrice(false); }}
                    className={[
                      'border-2 border-[var(--border)] px-4 py-2 text-sm font-bold transition-all',
                      config.priceUsd === p.value && !customPrice
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[2px_2px_0_var(--border)]'
                        : 'bg-[var(--card)] hover:bg-[var(--muted)]',
                    ].join(' ')}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomPrice(true)}
                  className={[
                    'border-2 border-[var(--border)] px-4 py-2 text-sm font-bold transition-all',
                    customPrice
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[2px_2px_0_var(--border)]'
                      : 'bg-[var(--card)] hover:bg-[var(--muted)]',
                  ].join(' ')}
                >
                  {t('priceCustom')}
                </button>
              </div>
              {customPrice && (
                <div className="flex items-center gap-2">
                  <span className="font-bold">$</span>
                  <input
                    type="number"
                    min="0.000001"
                    step="0.01"
                    placeholder="0.00"
                    value={config.priceUsd}
                    onChange={(e) => set({ priceUsd: e.target.value })}
                    className="w-32 border-2 border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                  <span className="text-sm text-[var(--muted-foreground)]">
                    = {toMicroUnits(config.priceUsd)} {t('priceMicroUnits')}
                  </span>
                </div>
              )}
            </div>

            {/* Mode */}
            <div className="mb-8">
              <label className="mb-2 block font-bold">{t('modeLabel')}</label>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('modeHint')}</p>
              <div className="flex gap-0">
                {(['client', 'server'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ mode: m })}
                    className={[
                      'flex-1 border-2 border-[var(--border)] px-4 py-3 text-sm font-bold transition-all',
                      m === 'client' ? 'border-r-0' : '',
                      config.mode === m
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--card)] hover:bg-[var(--muted)]',
                    ].join(' ')}
                  >
                    {m === 'client' ? t('modeClient') : t('modeServer')}
                  </button>
                ))}
              </div>
              {config.mode === 'client' && (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">{t('modeClientHint')}</p>
              )}
              {config.mode === 'server' && (
                <div className="mt-3 space-y-3">
                  <div className="border-2 border-[var(--accent)] bg-[var(--accent)] p-4">
                    <p className="text-sm font-bold text-[var(--accent-foreground)]">
                      {t('modeServerWarningTitle')}
                    </p>
                    <p className="mt-1 text-sm text-[var(--accent-foreground)] opacity-80">
                      {t('modeServerWarningBody')}{' '}
                      <a href="https://docs.kobaru.io/introduction/how-x402-works" target="_blank" rel="noopener noreferrer" className="font-bold underline">
                        {t('modeServerWarningLink')}
                      </a>
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold" htmlFor="paymentUrl">
                      {t('modeServerEndpointLabel')}
                    </label>
                    <input
                      id="paymentUrl"
                      type="url"
                      placeholder="https://yoursite.com/api/paperwall-payment"
                      value={config.paymentUrl}
                      onChange={(e) => set({ paymentUrl: e.target.value })}
                      className="w-full border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {t('modeServerEndpointHint')}{' '}
                      <a href="https://github.com/kobaru-io/paperwall/blob/main/docs/publisher-guide.md#tier-3-server-mode" target="_blank" rel="noopener noreferrer" className="underline">
                        {t('modeServerEndpointLinkText')}
                      </a>{' '}
                      {t('modeServerEndpointHint2')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Optimistic */}
            <div>
              <label className="mb-2 block font-bold">{t('accessLabel')}</label>
              <div className="flex gap-0">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => set({ optimistic: val })}
                    className={[
                      'flex-1 border-2 border-[var(--border)] px-4 py-3 text-sm font-bold transition-all',
                      val ? 'border-r-0' : '',
                      config.optimistic === val
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--card)] hover:bg-[var(--muted)]',
                    ].join(' ')}
                  >
                    {val ? t('accessInstant') : t('accessConfirmed')}
                  </button>
                ))}
              </div>
              {config.optimistic ? (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">{t('accessInstantHint')}</p>
              ) : (
                <div className="mt-3 border-2 border-[var(--destructive)] bg-[var(--destructive)]/10 p-4">
                  <p className="text-sm font-bold text-[var(--destructive)]">{t('accessConfirmedWarningTitle')}</p>
                  <p className="mt-1 text-sm text-[var(--destructive)] opacity-80">{t('accessConfirmedWarningBody')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right — code output */}
          <div className="flex flex-col border-2 border-[var(--border)] shadow-[6px_6px_0_var(--border)]">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b-2 border-[var(--border)] bg-[var(--muted)] px-5 py-3">
              <span className="font-bold text-sm">{t('codeTitle')}</span>
              <button
                type="button"
                onClick={handleCopy}
                className={[
                  'border-2 border-[var(--border)] px-4 py-1.5 text-sm font-bold transition-all',
                  'shadow-[3px_3px_0_var(--border)] hover:shadow-[5px_5px_0_var(--border)]',
                  'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
                  copied
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'bg-[var(--card)]',
                ].join(' ')}
              >
                {copied ? t('codeCopied') : t('codeCopy')}
              </button>
            </div>

            {/* Code block */}
            <pre className="flex-1 overflow-x-auto bg-[var(--secondary)] p-6 text-xs leading-relaxed text-[var(--secondary-foreground)]">
              <code>{code}</code>
            </pre>

            {/* Instructions */}
            <div className="border-t-2 border-[var(--border)] bg-[var(--card)] p-5">
              <p className="mb-2 text-sm font-bold">{t('nextStepsTitle')}</p>
              <ol className="list-decimal pl-4 text-sm text-[var(--muted-foreground)] space-y-1">
                <li>{t('nextStep1')} <code className="font-bold">&lt;/body&gt;</code> {t('nextStep1b')}</li>
                <li>{t('nextStep2')}</li>
                <li>{t('nextStep3')}</li>
              </ol>
              <a
                href="https://github.com/kobaru-io/paperwall/blob/main/docs/publisher-guide.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-2"
              >
                {t('fullGuideLink')}
              </a>
            </div>
          </div>

        </div>

        {/* Platform instructions */}
        <div className="mt-12">
          <h2 className="mb-6 font-[family-name:var(--font-head)] text-2xl md:text-3xl">
            {t('platformsTitle')}
          </h2>

          <div className="grid grid-cols-1 gap-0 border-2 border-[var(--border)] md:grid-cols-2 lg:grid-cols-3">
            {PLATFORMS.map((platform, i) => (
              <div
                key={platform.name}
                className={[
                  'border-[var(--border)] bg-[var(--card)] p-6',
                  // right borders
                  'md:[&:nth-child(odd)]:border-r-2',
                  'lg:[&:nth-child(odd)]:border-r-0',
                  'lg:[&:not(:nth-child(3n))]:border-r-2',
                  // bottom borders (all except last row)
                  i < PLATFORMS.length - (PLATFORMS.length % 3 || 3)
                    ? 'border-b-2'
                    : '',
                ].join(' ')}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-2xl">{platform.icon}</span>
                  <span className="font-[family-name:var(--font-head)] text-lg">{platform.name}</span>
                </div>
                <ol className="space-y-1.5 text-sm text-[var(--muted-foreground)]">
                  {platform.steps.map((step, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="shrink-0 font-bold text-[var(--foreground)]">{j + 1}.</span>
                      <span dangerouslySetInnerHTML={{ __html: step }} />
                    </li>
                  ))}
                </ol>
                {platform.tip && (
                  <p className="mt-3 border-l-2 border-[var(--accent)] pl-3 text-xs text-[var(--muted-foreground)]">
                    💡 {platform.tip}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
