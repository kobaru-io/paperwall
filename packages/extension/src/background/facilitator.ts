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
import { isPrivateIP } from '../shared/origin-security.js';

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
  // Validate facilitator URL for security
  if (!isAllowedFacilitatorUrl(facilitatorUrl)) {
    throw new FacilitatorError(
      'Facilitator URL must be HTTPS and cannot be a private IP address',
      'INVALID_URL',
    );
  }

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
