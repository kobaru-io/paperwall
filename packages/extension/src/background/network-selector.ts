import { getNetworkPriority, getExpectedAsset } from '../shared/constants.js';

export interface AcceptEntry {
  readonly network: string;
  readonly asset?: string;
  readonly payTo?: string;
}

export interface ResolvedPaymentOption {
  /** CAIP-2 network identifier */
  readonly network: string;
  /** Resolved USDC token contract address */
  readonly asset: string;
  /** Resolved recipient address */
  readonly payTo: string;
}

/**
 * Selects the highest-priority network that has sufficient balance for the
 * required payment amount. Pure function with no side effects.
 *
 * @param accepts - Publisher-advertised payment options
 * @param balances - User balances keyed by CAIP-2 network identifier
 * @param requiredAmount - Payment amount in atomic units (decimal integer string)
 * @param defaultPayTo - Fallback recipient address when entry has no payTo
 * @returns The best viable resolved payment option, or null if none qualify
 */
export function selectNetwork(
  accepts: ReadonlyArray<AcceptEntry>,
  balances: ReadonlyMap<string, { raw: string }>,
  requiredAmount: string,
  defaultPayTo: string,
): ResolvedPaymentOption | null {
  const required = BigInt(requiredAmount);

  const viable: Array<{ option: ResolvedPaymentOption; priority: number }> = [];

  for (const entry of accepts) {
    const priority = getNetworkPriority(entry.network);
    if (priority === Infinity) {
      continue;
    }

    const expectedAsset = getExpectedAsset(entry.network);
    if (!expectedAsset) {
      continue; // unknown network
    }
    if (entry.asset && entry.asset.toLowerCase() !== expectedAsset.toLowerCase()) {
      continue; // publisher-supplied asset doesn't match registry — reject entry
    }
    const resolvedAsset = expectedAsset;

    const balance = BigInt(balances.get(entry.network)?.raw ?? '0');
    if (balance < required) {
      continue;
    }

    viable.push({
      option: {
        network: entry.network,
        asset: resolvedAsset,
        payTo: entry.payTo ?? defaultPayTo,
      },
      priority,
    });
  }

  if (viable.length === 0) {
    return null;
  }

  viable.sort((a, b) => a.priority - b.priority);

  return viable[0]?.option ?? null;
}
