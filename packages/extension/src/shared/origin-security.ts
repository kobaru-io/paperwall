// ── Origin Security Utilities ─────────────────────────────────────
// Shared URL validation functions for payment origin verification.
// Used by content scripts, bridge, service worker, and decision engine.

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
 * Checks if a hostname is a private/internal IP address.
 * Handles IPv4-mapped IPv6 in both dotted (::ffff:127.0.0.1) and
 * hex (::ffff:7f00:1) forms — URL.hostname normalizes to the hex form.
 */
export function isPrivateIP(hostname: string): boolean {
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
 * Checks if a URL scheme is allowed for payments.
 * Only 'https:' is allowed.
 */
export function isAllowedPaymentScheme(protocol: string): boolean {
  return protocol === 'https:';
}

/**
 * Validates an origin is safe for payment processing.
 */
export function validatePaymentOrigin(origin: string): { valid: true } | { valid: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (!isAllowedPaymentScheme(parsed.protocol)) {
    return { valid: false, reason: 'insecure-scheme' };
  }

  if (isPrivateIP(parsed.hostname)) {
    return { valid: false, reason: 'private-network' };
  }

  return { valid: true };
}

/**
 * Normalizes an origin for consistent matching.
 * Lowercases and strips trailing slash.
 */
export function normalizeOrigin(origin: string): string {
  return origin.toLowerCase().replace(/\/$/, '');
}
