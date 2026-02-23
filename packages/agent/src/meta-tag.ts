/**
 * Meta tag parser for x402 payment detection.
 *
 * Extracts and validates the <meta name="x402-payment-required"> tag
 * from HTML content. The tag contains a base64-encoded JSON payload
 * describing the payment terms.
 */

export interface AcceptedPayment {
  readonly scheme: string;
  readonly network: string;
  readonly amount: string;
  readonly asset: string;
  readonly payTo: string;
}

export interface MetaTagPayload {
  readonly x402Version: 2;
  readonly mode: 'client' | 'server';
  readonly facilitatorUrl: string;
  readonly siteKey?: string;
  readonly paymentUrl?: string;
  readonly accepts: readonly AcceptedPayment[];
  readonly optimistic: boolean;
}

/**
 * Regex to match the x402 payment meta tag.
 * Matches: <meta name="x402-payment-required" content="...">
 * Case-insensitive, supports single or double quotes.
 * Allows extra attributes between name and content.
 */
const META_TAG_REGEX =
  /<meta\s+name=["']x402-payment-required["']\s+content=["']([^"']+)["']/i;

/**
 * Parse an HTML string for the x402 payment meta tag.
 *
 * @param html - Raw HTML content
 * @returns Parsed and validated MetaTagPayload, or null if no valid tag found
 */
export function parseMetaTag(html: string): MetaTagPayload | null {
  const match = META_TAG_REGEX.exec(html);
  if (!match?.[1]) {
    return null;
  }

  const base64Content = match[1];

  // Base64-decode
  let jsonString: string;
  try {
    jsonString = Buffer.from(base64Content, 'base64').toString('utf-8');
  } catch {
    return null;
  }

  // JSON-parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return null;
  }

  // Validate structure
  if (!isRecord(parsed)) {
    return null;
  }

  // Validate x402Version === 2
  if (parsed['x402Version'] !== 2) {
    return null;
  }

  // Validate mode
  const mode = parsed['mode'];
  if (mode !== 'client' && mode !== 'server') {
    return null;
  }

  // Validate required string fields
  const facilitatorUrl = parsed['facilitatorUrl'];
  if (typeof facilitatorUrl !== 'string' || facilitatorUrl.length === 0) {
    return null;
  }

  const siteKey = parsed['siteKey'];
  if (siteKey !== undefined && typeof siteKey !== 'string') {
    return null;
  }

  // Validate accepts array
  const accepts = parsed['accepts'];
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return null;
  }

  // Validate first accepted payment
  const first: unknown = accepts[0];
  if (!isRecord(first)) {
    return null;
  }

  if (
    typeof first['scheme'] !== 'string' ||
    typeof first['network'] !== 'string' ||
    typeof first['amount'] !== 'string' ||
    typeof first['asset'] !== 'string' ||
    typeof first['payTo'] !== 'string'
  ) {
    return null;
  }

  // Validate optional paymentUrl
  const paymentUrl = parsed['paymentUrl'];
  if (paymentUrl !== undefined && typeof paymentUrl !== 'string') {
    return null;
  }

  // Build validated accepts array
  const validatedAccepts: AcceptedPayment[] = [];
  for (const entry of accepts) {
    if (!isRecord(entry)) continue;
    if (
      typeof entry['scheme'] !== 'string' ||
      typeof entry['network'] !== 'string' ||
      typeof entry['amount'] !== 'string' ||
      typeof entry['asset'] !== 'string' ||
      !isEthAddress(entry['asset']) ||
      typeof entry['payTo'] !== 'string'
    ) {
      continue;
    }
    validatedAccepts.push({
      scheme: entry['scheme'],
      network: entry['network'],
      amount: entry['amount'],
      asset: entry['asset'],
      payTo: entry['payTo'],
    });
  }

  if (validatedAccepts.length === 0) {
    return null;
  }

  // Extract data-optimistic attribute from the full meta tag
  const optimisticMatch = /<meta[^>]*data-optimistic=["']([^"']+)["'][^>]*>/i.exec(html);
  const optimistic = optimisticMatch?.[1] !== 'false';

  return {
    x402Version: 2,
    mode,
    facilitatorUrl,
    ...(typeof siteKey === 'string' && siteKey.length > 0 ? { siteKey } : {}),
    ...(typeof paymentUrl === 'string' ? { paymentUrl } : {}),
    accepts: validatedAccepts,
    optimistic,
  };
}

// -- Script Tag Parser ---

/**
 * Default USDC address on SKALE Base Sepolia testnet.
 */
const DEFAULT_ASSET = '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD';

/**
 * Regex to match a <script> tag whose src contains "paperwall".
 * Captures the full tag contents (attributes) for data-* extraction.
 */
const SCRIPT_TAG_REGEX = /<script\s+([^>]*src=["'][^"']*paperwall[^"']*["'][^>]*)>/gi;

/**
 * Extract a data-* attribute value from a tag string.
 */
function extractDataAttr(tag: string, name: string): string | undefined {
  const regex = new RegExp(`data-${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = regex.exec(tag);
  return match?.[1];
}

/**
 * Parse SDK payment config from a `<script src="...paperwall..." data-*>` tag.
 *
 * @param html - Raw HTML content
 * @returns Parsed and validated MetaTagPayload, or null if no valid tag found
 */
export function parseScriptTag(html: string): MetaTagPayload | null {
  SCRIPT_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCRIPT_TAG_REGEX.exec(html)) !== null) {
    const tag = match[1];
    if (!tag) continue;

    const facilitatorUrl = extractDataAttr(tag, 'facilitator-url');
    const payTo = extractDataAttr(tag, 'pay-to');
    const price = extractDataAttr(tag, 'price');
    const network = extractDataAttr(tag, 'network');

    if (!facilitatorUrl || !payTo || !price || !network) continue;

    const result = buildPayload({
      facilitatorUrl,
      payTo,
      price,
      network,
      mode: extractDataAttr(tag, 'mode'),
      asset: extractDataAttr(tag, 'asset'),
      paymentUrl: extractDataAttr(tag, 'payment-url'),
      siteKey: extractDataAttr(tag, 'site-key'),
      optimistic: extractDataAttr(tag, 'optimistic'),
    });

    if (result) return result;
  }

  return null;
}

// -- Init Call Parser ---

/**
 * Parse SDK payment config from a `Paperwall.init({ ... })` call in HTML.
 *
 * Takes a 2 KB window after the call and extracts string properties by name
 * rather than parsing full JS object syntax.
 *
 * @param html - Raw HTML content
 * @returns Parsed and validated MetaTagPayload, or null if no valid call found
 */
export function parseInitCall(html: string): MetaTagPayload | null {
  const marker = 'Paperwall.init(';
  let searchFrom = 0;

  while (true) {
    const idx = html.indexOf(marker, searchFrom);
    if (idx === -1) return null;

    const window = html.substring(idx + marker.length, idx + marker.length + 2048);

    const facilitatorUrl = extractStringProp(window, 'facilitatorUrl');
    const payTo = extractStringProp(window, 'payTo');
    const price = extractStringProp(window, 'price');
    const network = extractStringProp(window, 'network');

    if (facilitatorUrl && payTo && price && network) {
      const result = buildPayload({
        facilitatorUrl,
        payTo,
        price,
        network,
        mode: extractStringProp(window, 'mode'),
        asset: extractStringProp(window, 'asset'),
        paymentUrl: extractStringProp(window, 'paymentUrl'),
        siteKey: extractStringProp(window, 'siteKey'),
        optimistic: extractStringProp(window, 'optimistic'),
      });

      if (result) return result;
    }

    searchFrom = idx + marker.length;
  }
}

/**
 * Extract a string property value from a JS object literal window.
 * Matches: propName: 'value' or propName: "value"
 */
function extractStringProp(window: string, name: string): string | undefined {
  const regex = new RegExp(`${name}\\s*:\\s*['"]([^'"]+)['"]`);
  const match = regex.exec(window);
  return match?.[1];
}

// -- Shared Helpers ---

interface RawPaymentConfig {
  readonly facilitatorUrl: string;
  readonly payTo: string;
  readonly price: string;
  readonly network: string;
  readonly mode?: string;
  readonly asset?: string;
  readonly paymentUrl?: string;
  readonly siteKey?: string;
  readonly optimistic?: string;
}

/**
 * Validate raw config values and build a MetaTagPayload.
 * Shared by parseScriptTag and parseInitCall.
 */
function buildPayload(config: RawPaymentConfig): MetaTagPayload | null {
  // Validate facilitatorUrl
  try {
    const parsed = new URL(config.facilitatorUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  // Validate payTo is an Ethereum address
  if (!isEthAddress(config.payTo)) return null;

  // Validate price is a positive integer (smallest unit)
  if (!/^\d+$/.test(config.price) || config.price === '0') return null;

  // Validate network is CAIP-2 format
  if (!/^eip155:\d+$/.test(config.network)) return null;

  // Validate mode
  const mode = config.mode ?? 'client';
  if (mode !== 'client' && mode !== 'server') return null;

  // Validate asset (default to SKALE USDC)
  const asset = config.asset ?? DEFAULT_ASSET;
  if (!isEthAddress(asset)) return null;

  // Validate paymentUrl if present
  if (config.paymentUrl) {
    try {
      new URL(config.paymentUrl);
    } catch {
      return null;
    }
  }

  return {
    x402Version: 2,
    mode,
    facilitatorUrl: config.facilitatorUrl,
    ...(config.siteKey ? { siteKey: config.siteKey } : {}),
    ...(config.paymentUrl ? { paymentUrl: config.paymentUrl } : {}),
    accepts: [
      {
        scheme: 'exact',
        network: config.network,
        amount: config.price,
        asset,
        payTo: config.payTo,
      },
    ],
    optimistic: config.optimistic !== 'false',
  };
}

/**
 * Type guard for plain objects.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a valid Ethereum address (0x + 40 hex chars).
 */
function isEthAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
