import { timingSafeEqual, createHmac } from 'node:crypto';

interface AccessResult {
  readonly allowed: boolean;
  readonly reason?: 'missing_key' | 'invalid_key';
}

export function checkAccess(
  configuredKeys: readonly string[],
  providedKey: string | undefined,
): AccessResult {
  // No keys configured = open access
  if (configuredKeys.length === 0) {
    return { allowed: true };
  }

  // Keys configured but none provided
  if (!providedKey) {
    return { allowed: false, reason: 'missing_key' };
  }

  // Check against each configured key using constant-time comparison
  for (const key of configuredKeys) {
    if (safeEqual(key, providedKey)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'invalid_key' };
}

const HMAC_KEY = 'paperwall-access-gate';

function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', HMAC_KEY).update(a).digest();
  const hb = createHmac('sha256', HMAC_KEY).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function parseAccessKeys(envValue: string | undefined): string[] {
  if (!envValue || envValue.trim() === '') {
    return [];
  }
  return envValue
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}
