/**
 * Formats USDC amount from smallest unit (6 decimals) to human-readable string.
 * Examples:
 *   10000n → "0.01"
 *   1000000n → "1.00"
 *   1500000n → "1.50"
 *   1560000n → "1.56"
 */
export function formatUsdc(smallestUnit: bigint): string {
  const divisor = 1_000_000n;
  const whole = smallestUnit / divisor;
  const remainder = smallestUnit % divisor;
  const decimal =
    remainder.toString().padStart(6, '0').replace(/0+$/, '') || '0';
  return `${whole}.${decimal.length < 2 ? decimal.padEnd(2, '0') : decimal}`;
}

/**
 * Formats USDC amount from string representation of smallest unit.
 */
export function formatUsdcFromString(smallestUnit: string): string {
  return formatUsdc(BigInt(smallestUnit));
}
