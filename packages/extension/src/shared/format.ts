/**
 * Formats USDC amount from smallest unit (6 decimals) to human-readable string.
 * Shows up to 6 decimal places, trimming trailing zeros but keeping at least 2.
 * Examples:
 *   1n       → "0.000001"
 *   10000n   → "0.01"
 *   1000000n → "1.00"
 *   1500000n → "1.50"
 *   1234567n → "1.234567"
 *   1234560n → "1.23456"
 */
export function formatUsdc(smallestUnit: bigint): string {
  const divisor = 1_000_000n;
  const whole = smallestUnit / divisor;
  const remainder = smallestUnit % divisor;
  const full = remainder.toString().padStart(6, '0');
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = full.replace(/0+$/, '');
  const decimal = trimmed.length < 2 ? full.slice(0, 2) : trimmed;
  return `${whole}.${decimal}`;
}

/**
 * Formats USDC amount from string representation of smallest unit.
 */
export function formatUsdcFromString(smallestUnit: string): string {
  return formatUsdc(BigInt(smallestUnit));
}

/**
 * Formats a timestamp as a relative time string (e.g., "just now", "5m ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs < 60_000) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
