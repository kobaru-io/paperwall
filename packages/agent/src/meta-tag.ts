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
  readonly asset?: string;
  readonly payTo?: string;
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
    typeof first['amount'] !== 'string'
  ) {
    return null;
  }
  // asset and payTo are optional — validated below if present

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
      typeof entry['amount'] !== 'string'
    ) {
      continue;
    }
    // Validate asset if present (must be valid Ethereum address)
    const entryAsset = typeof entry['asset'] === 'string' ? entry['asset'] : undefined;
    if (entryAsset !== undefined && !isEthAddress(entryAsset)) {
      continue;
    }
    // payTo is optional — let the network selector resolve it if absent
    const entryPayTo = typeof entry['payTo'] === 'string' ? entry['payTo'] : undefined;
    validatedAccepts.push({
      scheme: entry['scheme'],
      network: entry['network'],
      amount: entry['amount'],
      ...(entryAsset !== undefined ? { asset: entryAsset } : {}),
      ...(entryPayTo !== undefined ? { payTo: entryPayTo } : {}),
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
 * Regex to match a <script> tag whose src contains "paperwall".
 * Captures the full tag contents (attributes) for data-* extraction.
 */
const SCRIPT_TAG_REGEX = /<script\s+([^>]*src=["'][^"']*paperwall[^"']*["'][^>]*)>/gi;

/**
 * Extract a data-* attribute value from a tag string.
 */
function extractDataAttr(tag: string, name: string): string | undefined {
  // Try single-quoted attribute first (allows double quotes inside, e.g. JSON)
  const singleQuoteRegex = new RegExp(`data-${name}\\s*=\\s*'([^']+)'`, 'i');
  const singleMatch = singleQuoteRegex.exec(tag);
  if (singleMatch?.[1]) return singleMatch[1];

  // Try double-quoted attribute (allows single quotes inside)
  const doubleQuoteRegex = new RegExp(`data-${name}\\s*=\\s*"([^"]+)"`, 'i');
  const doubleMatch = doubleQuoteRegex.exec(tag);
  return doubleMatch?.[1];
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
    const dataAccepts = extractDataAttr(tag, 'accepts');

    // Mode B: multi-network via data-accepts attribute
    if (!network && dataAccepts && facilitatorUrl) {
      let parsedAccepts: unknown;
      try {
        parsedAccepts = JSON.parse(dataAccepts);
      } catch {
        continue;
      }
      if (!Array.isArray(parsedAccepts) || parsedAccepts.length === 0) continue;

      const acceptEntries: Array<{ scheme?: string; network: string; amount: string; asset?: string; payTo?: string }> = [];
      for (const entry of parsedAccepts) {
        if (!isRecord(entry)) continue;
        if (typeof entry['network'] !== 'string' || typeof entry['amount'] !== 'string') continue;
        acceptEntries.push({
          scheme: typeof entry['scheme'] === 'string' ? entry['scheme'] : undefined,
          network: entry['network'],
          amount: entry['amount'],
          asset: typeof entry['asset'] === 'string' ? entry['asset'] : undefined,
          payTo: typeof entry['payTo'] === 'string' ? entry['payTo'] : undefined,
        });
      }

      const result = buildMultiNetworkPayload({
        facilitatorUrl,
        accepts: acceptEntries,
        mode: extractDataAttr(tag, 'mode'),
        paymentUrl: extractDataAttr(tag, 'payment-url'),
        siteKey: extractDataAttr(tag, 'site-key'),
        optimistic: extractDataAttr(tag, 'optimistic'),
      });

      if (result) return result;
      continue;
    }

    // Mode A: single-network via individual data-* attributes
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

    // Mode A: single-network with individual properties (payTo + price + network all present)
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

    // Mode B: multi-network with accepts array (no top-level payTo/price required)
    if (facilitatorUrl && (!payTo || !price)) {
      const acceptEntries = extractAcceptsArray(window);
      if (acceptEntries.length > 0) {
        const result = buildMultiNetworkPayload({
          facilitatorUrl,
          accepts: acceptEntries,
          mode: extractStringProp(window, 'mode'),
          paymentUrl: extractStringProp(window, 'paymentUrl'),
          siteKey: extractStringProp(window, 'siteKey'),
          optimistic: extractStringProp(window, 'optimistic'),
        });

        if (result) return result;
      }
    }

    searchFrom = idx + marker.length;
  }
}

/**
 * Extract an accepts array from a JS object literal window.
 * Matches: accepts: [ { network: '...', amount: '...', ... }, ... ]
 */
function extractAcceptsArray(
  window: string,
): Array<{ scheme?: string; network: string; amount: string; asset?: string; payTo?: string }> {
  const acceptsMatch = /accepts\s*:\s*\[/.exec(window);
  if (!acceptsMatch) return [];

  const startIdx = acceptsMatch.index + acceptsMatch[0].length;
  // Find the matching closing bracket
  let depth = 1;
  let endIdx = startIdx;
  while (endIdx < window.length && depth > 0) {
    if (window[endIdx] === '[') depth++;
    if (window[endIdx] === ']') depth--;
    endIdx++;
  }

  if (depth !== 0) return [];

  // Extract the array content (without outer brackets)
  const arrayContent = window.substring(startIdx, endIdx - 1);

  // Parse individual objects by finding { ... } patterns
  const entries: Array<{ scheme?: string; network: string; amount: string; asset?: string; payTo?: string }> = [];
  const objectRegex = /\{[^}]+\}/g;
  let objMatch: RegExpExecArray | null;

  while ((objMatch = objectRegex.exec(arrayContent)) !== null) {
    const objStr = objMatch[0];
    const networkVal = extractStringProp(objStr, 'network');
    const amountVal = extractStringProp(objStr, 'amount');
    if (!networkVal || !amountVal) continue;

    entries.push({
      scheme: extractStringProp(objStr, 'scheme'),
      network: networkVal,
      amount: amountVal,
      asset: extractStringProp(objStr, 'asset'),
      payTo: extractStringProp(objStr, 'payTo'),
    });
  }

  return entries;
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

interface RawMultiNetworkConfig {
  readonly facilitatorUrl: string;
  readonly accepts: ReadonlyArray<{
    readonly scheme?: string;
    readonly network: string;
    readonly amount: string;
    readonly asset?: string;
    readonly payTo?: string;
  }>;
  readonly mode?: string;
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

  // Validate asset if present (no default — let network selector resolve)
  const asset = config.asset;
  if (asset !== undefined && !isEthAddress(asset)) return null;

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
        ...(asset !== undefined ? { asset } : {}),
        payTo: config.payTo,
      },
    ],
    optimistic: config.optimistic !== 'false',
  };
}

/**
 * Validate a multi-network config and build a MetaTagPayload.
 * Used when publishers specify accepts[] instead of a single network.
 */
function buildMultiNetworkPayload(config: RawMultiNetworkConfig): MetaTagPayload | null {
  // Validate facilitatorUrl
  try {
    const parsed = new URL(config.facilitatorUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  if (config.accepts.length === 0) return null;

  // Validate mode
  const mode = config.mode ?? 'client';
  if (mode !== 'client' && mode !== 'server') return null;

  // Validate paymentUrl if present
  if (config.paymentUrl) {
    try {
      new URL(config.paymentUrl);
    } catch {
      return null;
    }
  }

  // Build validated accepts array
  const validatedAccepts: AcceptedPayment[] = [];
  for (const entry of config.accepts) {
    // Validate network is CAIP-2 format
    if (!/^eip155:\d+$/.test(entry.network)) continue;

    // Validate amount is a positive integer
    if (!/^\d+$/.test(entry.amount) || entry.amount === '0') continue;

    // Validate asset if present
    if (entry.asset !== undefined && !isEthAddress(entry.asset)) continue;

    // Validate payTo if present
    if (entry.payTo !== undefined && !isEthAddress(entry.payTo)) continue;

    validatedAccepts.push({
      scheme: entry.scheme ?? 'exact',
      network: entry.network,
      amount: entry.amount,
      ...(entry.asset !== undefined ? { asset: entry.asset } : {}),
      ...(entry.payTo !== undefined ? { payTo: entry.payTo } : {}),
    });
  }

  if (validatedAccepts.length === 0) return null;

  return {
    x402Version: 2,
    mode,
    facilitatorUrl: config.facilitatorUrl,
    ...(config.siteKey ? { siteKey: config.siteKey } : {}),
    ...(config.paymentUrl ? { paymentUrl: config.paymentUrl } : {}),
    accepts: validatedAccepts,
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
