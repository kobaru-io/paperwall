/**
 * URL validation for outbound requests — prevents SSRF attacks.
 *
 * Validates that URLs used for facilitator, publisher, and payment endpoints
 * are HTTPS and do not point to private/internal IP addresses.
 * Handles IPv4-mapped IPv6 in both dotted (::ffff:127.0.0.1) and
 * hex (::ffff:7f00:1) forms — URL.hostname normalizes to the hex form.
 */

// -- Public API ---

/**
 * Validates that a URL is safe for outbound requests.
 * Enforces HTTPS and blocks private/internal IPs to prevent SSRF.
 */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      return false;
    }

    if (isPrivateIP(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Throws if the URL is not safe for outbound requests.
 */
export function assertAllowedUrl(url: string, label: string): void {
  if (!isAllowedUrl(url)) {
    throw new Error(`${label} must be HTTPS and cannot point to a private IP address: ${url}`);
  }
}

// -- Internal Helpers ---

function isPrivateIP(hostname: string): boolean {
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
    const bare = hostname.replace(/^\[|\]$/g, '');

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

function isPrivateIPv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}
