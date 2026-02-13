import type { PaperwallConfig, PaymentRequiredSignal } from './types';

const META_NAME = 'x402-payment-required';

/**
 * Builds a PaymentRequiredSignal from the SDK config.
 */
function buildSignal(config: PaperwallConfig): PaymentRequiredSignal {
  return {
    x402Version: 2,
    resource: {
      url: window.location.href,
      description: '',
      mimeType: '',
    },
    accepts: [
      {
        scheme: 'exact',
        network: config.network,
        amount: config.price,
        asset: config.asset ?? '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        payTo: config.payTo,
      },
    ],
  };
}

/**
 * Emits a <meta name="x402-payment-required"> tag in the document head.
 * If a tag already exists, it is replaced (not duplicated).
 */
export function emitSignal(config: PaperwallConfig): void {
  removeSignal();

  const signal = buildSignal(config);
  const encoded = btoa(JSON.stringify(signal));

  const meta = document.createElement('meta');
  meta.name = META_NAME;
  meta.content = encoded;
  meta.setAttribute('data-facilitator-url', config.facilitatorUrl);
  meta.setAttribute('data-mode', config.mode);

  if (config.siteKey) {
    meta.setAttribute('data-site-key', config.siteKey);
  }

  document.head.appendChild(meta);
}

/**
 * Removes the x402-payment-required meta tag from the document head.
 */
export function removeSignal(): void {
  const existing = document.querySelector(`meta[name="${META_NAME}"]`);
  if (existing) {
    existing.remove();
  }
}
