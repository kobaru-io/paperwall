import type { PaperwallConfig, PaymentOption, PaymentRequiredSignal } from './types';

const META_NAME = 'x402-payment-required';

/**
 * Builds a PaymentRequiredSignal from the SDK config.
 *
 * Supports two modes:
 * - Single-network: uses config.network (backwards compatible)
 * - Multi-network: uses config.accepts[] entries
 */
function buildSignal(config: PaperwallConfig): PaymentRequiredSignal {
  let accepts: PaymentOption[];

  if (config.accepts && config.accepts.length > 0) {
    // Multi-network mode: one entry per accepts[] entry
    accepts = config.accepts.map((entry) => {
      const option: PaymentOption = {
        scheme: 'exact',
        network: entry.network,
        amount: config.price,
        ...(entry.asset !== undefined ? { asset: entry.asset } : {}),
        ...(entry.payTo !== undefined ? { payTo: entry.payTo } : {}),
      };
      return option;
    });
  } else {
    // Single-network mode (backwards compatible)
    const option: PaymentOption = {
      scheme: 'exact',
      network: config.network as string,
      amount: config.price,
      ...(config.asset !== undefined ? { asset: config.asset } : {}),
      payTo: config.payTo,
    };
    accepts = [option];
  }

  return {
    x402Version: 2,
    resource: {
      url: window.location.href,
      description: '',
      mimeType: '',
    },
    accepts,
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

  // Optimistic defaults to true; emit as data attribute for extension/agent to read
  const optimistic = config.optimistic !== false;
  meta.setAttribute('data-optimistic', String(optimistic));

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
