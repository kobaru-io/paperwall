// ── Facilitator Client ───────────────────────────────────────────
// HTTP client for the Paperwall facilitator service.
// Endpoints: GET /supported, POST /verify, POST /settle

import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types';

export type { PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse, SupportedResponse };

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000;

// ── Supported Response Cache ─────────────────────────────────────

const supportedCache = new Map<string, { data: SupportedResponse; timestamp: number }>();
const SUPPORTED_CACHE_TTL = 3_600_000; // 1 hour

export function clearSupportedCache(): void {
  supportedCache.clear();
}

// ── Client Functions ─────────────────────────────────────────────

/**
 * Fetches supported payment kinds from the facilitator.
 * Results are cached in-memory for 1 hour per facilitatorUrl+siteKey combo.
 */
export async function getSupported(
  facilitatorUrl: string,
  siteKey?: string,
): Promise<SupportedResponse> {
  // Validate facilitator URL for security
  if (!isAllowedFacilitatorUrl(facilitatorUrl)) {
    throw new FacilitatorError(
      'Facilitator URL must be HTTPS and cannot be a private IP address',
      'INVALID_URL',
    );
  }

  const cacheKey = `${facilitatorUrl}|${siteKey ?? ''}`;
  const cached = supportedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SUPPORTED_CACHE_TTL) {
    return cached.data;
  }

  const url = `${facilitatorUrl.replace(/\/$/, '')}/supported`;
  const headers = buildHeaders(siteKey);

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers,
  });

  await assertOk(response);
  const data = (await response.json()) as SupportedResponse;
  supportedCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Verifies a signed payment with the facilitator.
 */
export async function verify(
  facilitatorUrl: string,
  siteKey: string | undefined,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const url = `${facilitatorUrl.replace(/\/$/, '')}/verify`;
  const headers = buildHeaders(siteKey);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
  });

  await assertOk(response);
  return response.json() as Promise<VerifyResponse>;
}

/**
 * Settles a signed payment on-chain via the facilitator.
 */
export async function settle(
  facilitatorUrl: string,
  siteKey: string | undefined,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  // Validate facilitator URL for security
  if (!isAllowedFacilitatorUrl(facilitatorUrl)) {
    throw new FacilitatorError(
      'Facilitator URL must be HTTPS and cannot be a private IP address',
      'INVALID_URL',
    );
  }

  const url = `${facilitatorUrl.replace(/\/$/, '')}/settle`;
  const headers = buildHeaders(siteKey);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
  });

  await assertOk(response);
  return response.json() as Promise<SettleResponse>;
}

// ── URL Validation ──────────────────────────────────────────────

/**
 * Checks if a hostname is a private/internal IP address.
 * Handles IPv4-mapped IPv6 in both dotted (::ffff:127.0.0.1) and
 * hex (::ffff:7f00:1) forms — URL.hostname normalizes to the hex form.
 */
function isPrivateIP(hostname: string): boolean {
  // Check for localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // Check for private IPv4 ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (isPrivateIPv4(a!, b!, c!, d!)) return true;
  }

  // Check for IPv6 ranges
  if (hostname.includes(':')) {
    // Strip brackets that URL.hostname may include for IPv6
    const bare = hostname.replace(/^\[|\]$/g, '');

    // Private IPv6 ranges
    if (bare === '::1') return true;
    if (bare.startsWith('fe80:') || bare.startsWith('fc00:') || bare.startsWith('fd00:')) {
      return true;
    }

    // IPv4-mapped IPv6 — dotted form: ::ffff:192.168.1.1
    const dottedMatch = bare.match(/^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/i);
    if (dottedMatch) {
      const [, a, b, c, d] = dottedMatch.map(Number);
      if (isPrivateIPv4(a!, b!, c!, d!)) return true;
    }

    // IPv4-mapped IPv6 — hex form: ::ffff:7f00:1
    // URL('https://[::ffff:127.0.0.1]').hostname normalizes to this form
    const hexMatch = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1]!, 16);
      const lo = parseInt(hexMatch[2]!, 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      if (isPrivateIPv4(a, b, c, d)) return true;
    }
  }

  return false;
}

/**
 * Checks if an IPv4 address (given as four octets) is in a private range.
 */
function isPrivateIPv4(a: number, b: number, _c: number, _d: number): boolean {
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  return false;
}

/**
 * Validates that a facilitator URL is safe to use.
 * Enforces HTTPS and blocks private/internal IPs to prevent SSRF.
 */
function isAllowedFacilitatorUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Enforce HTTPS only
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Block private/internal IPs
    if (isPrivateIP(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ── Internal Helpers ─────────────────────────────────────────────

function buildHeaders(
  siteKey?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (siteKey) {
    headers['Authorization'] = `Bearer ${siteKey}`;
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;

  if (response.status === 401) {
    throw new FacilitatorError(
      'Unauthorized: invalid or missing site key',
      'UNAUTHORIZED',
    );
  }

  if (response.status === 429) {
    throw new FacilitatorError(
      'Facilitator rate limit exceeded',
      'RATE_LIMITED',
    );
  }

  // Try to parse error body
  let message = `Facilitator error: HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      message = body.error;
    }
  } catch {
    // Ignore parse errors
  }

  throw new FacilitatorError(message, 'FACILITATOR_ERROR');
}

export class FacilitatorError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'FacilitatorError';
    this.code = code;
  }
}
