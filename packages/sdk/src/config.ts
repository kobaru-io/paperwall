import { PaperwallConfig, PaperwallError } from './types';

/**
 * Validates that a string is a well-formed URL (http or https).
 */
function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a valid Ethereum address (0x + 40 hex chars).
 */
function isValidEthAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Validates a CAIP-2 chain identifier (namespace:reference).
 * E.g. "eip155:1", "eip155:324705682".
 */
function isValidCaip2(value: string): boolean {
  return /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/.test(value);
}

/**
 * Validates that a string is a positive integer (no decimals).
 * Rejects decimal strings like "0.01" that would crash BigInt conversion.
 */
function isPositiveInteger(value: string): boolean {
  // Must be digits only (with optional leading zeros)
  if (!/^\d+$/.test(value)) return false;

  // Convert to BigInt to check it's positive
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

/**
 * Parses and validates a partial config into a full PaperwallConfig.
 * Throws PaperwallError for missing or invalid fields.
 */
export function parseConfig(input: Partial<PaperwallConfig>): PaperwallConfig {
  if (!input.facilitatorUrl) {
    throw new PaperwallError('Missing required field: facilitatorUrl');
  }
  if (!isValidUrl(input.facilitatorUrl)) {
    throw new PaperwallError('Invalid facilitatorUrl: must be a valid HTTP(S) URL');
  }

  if (!input.payTo) {
    throw new PaperwallError('Missing required field: payTo');
  }
  if (!isValidEthAddress(input.payTo)) {
    throw new PaperwallError('Invalid payTo: must be a valid Ethereum address (0x + 40 hex chars)');
  }

  if (!input.price) {
    throw new PaperwallError('Missing required field: price');
  }
  if (!isPositiveInteger(input.price)) {
    throw new PaperwallError('Invalid price: must be a positive integer (smallest unit, e.g. "1000000" for $1 USDC)');
  }

  if (!input.network) {
    throw new PaperwallError('Missing required field: network');
  }
  if (!isValidCaip2(input.network)) {
    throw new PaperwallError('Invalid network: must be a valid CAIP-2 identifier (e.g. eip155:1)');
  }

  if (input.asset && !isValidEthAddress(input.asset)) {
    throw new PaperwallError('Invalid asset: must be a valid Ethereum address (0x + 40 hex chars)');
  }

  const mode = input.mode ?? 'client';

  if (mode === 'server' && !input.paymentUrl) {
    throw new PaperwallError('Missing paymentUrl: required when mode is "server"');
  }

  if (input.paymentUrl && !isValidUrl(input.paymentUrl)) {
    throw new PaperwallError('Invalid paymentUrl: must be a valid HTTP(S) URL');
  }

  return {
    facilitatorUrl: input.facilitatorUrl,
    payTo: input.payTo,
    price: input.price,
    network: input.network,
    asset: input.asset,
    mode,
    paymentUrl: input.paymentUrl,
    siteKey: input.siteKey,
    onPaymentSuccess: input.onPaymentSuccess,
    onPaymentError: input.onPaymentError,
    optimistic: input.optimistic,
    onOptimisticAccess: input.onOptimisticAccess,
  };
}

/**
 * Reads data-* attributes from a script element and parses them into a PaperwallConfig.
 * Returns null if the script tag lacks required data attributes.
 */
export function parseScriptTag(scriptElement: HTMLScriptElement): PaperwallConfig | null {
  const facilitatorUrl = scriptElement.getAttribute('data-facilitator-url');
  const payTo = scriptElement.getAttribute('data-pay-to');
  const price = scriptElement.getAttribute('data-price');
  const network = scriptElement.getAttribute('data-network');

  if (!facilitatorUrl || !payTo || !price || !network) {
    return null;
  }

  // Validate mode attribute value
  const rawMode = scriptElement.getAttribute('data-mode');
  const mode = rawMode === 'client' || rawMode === 'server' ? rawMode : undefined;

  const asset = scriptElement.getAttribute('data-asset') ?? undefined;
  const paymentUrl = scriptElement.getAttribute('data-payment-url') ?? undefined;
  const siteKey = scriptElement.getAttribute('data-site-key') ?? undefined;
  const rawOptimistic = scriptElement.getAttribute('data-optimistic');
  const optimistic = rawOptimistic === 'false' ? false : undefined;

  return parseConfig({
    facilitatorUrl,
    payTo,
    price,
    network,
    asset,
    mode,
    paymentUrl,
    siteKey,
    optimistic,
  });
}
