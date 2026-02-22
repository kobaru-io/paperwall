import { readJsonFile, writeJsonFile } from './storage.js';
import { getTodayTotal, getLifetimeTotal, getSpendingTotals } from './history.js';

const BUDGET_FILENAME = 'budget.json';
const USDC_DECIMALS = 6;
const USDC_MULTIPLIER = 10n ** BigInt(USDC_DECIMALS);

export interface BudgetConfig {
  readonly perRequestMax?: string;
  readonly dailyMax?: string;
  readonly totalMax?: string;
}

export interface BudgetCheckResult {
  readonly allowed: boolean;
  readonly reason?: 'per_request' | 'daily' | 'total' | 'max_price' | 'no_budget';
  readonly limit?: string;
  readonly spent?: string;
}

/**
 * Convert human-readable USDC string (e.g., "0.01") to smallest unit string (e.g., "10000").
 * Uses integer arithmetic to avoid floating-point precision issues.
 */
export function usdcToSmallest(usdc: string): string {
  const parts = usdc.split('.');
  const wholePart = parts[0] ?? '0';
  const fracPart = (parts[1] ?? '').padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);

  const whole = BigInt(wholePart) * USDC_MULTIPLIER;
  const frac = BigInt(fracPart);

  return (whole + frac).toString();
}

/**
 * Convert smallest unit string (e.g., "10000") to human-readable USDC string (e.g., "0.01").
 */
export function smallestToUsdc(smallest: string): string {
  const value = BigInt(smallest);
  const whole = value / USDC_MULTIPLIER;
  const remainder = value % USDC_MULTIPLIER;

  // Pad remainder to 6 digits, then strip trailing zeros but keep at least 2 decimal places
  const fracStr = remainder.toString().padStart(USDC_DECIMALS, '0');
  const trimmed = fracStr.replace(/0+$/, '');

  const decimal = trimmed.length < 2 ? trimmed.padEnd(2, '0') : trimmed;

  return `${whole}.${decimal}`;
}

/**
 * Set budget limits. Merges with existing config (partial update).
 */
export function setBudget(partial: Partial<BudgetConfig>): BudgetConfig {
  const existing = readJsonFile<BudgetConfig>(BUDGET_FILENAME) ?? {};

  const merged: BudgetConfig = {
    ...existing,
    ...filterUndefined(partial),
  };

  writeJsonFile(BUDGET_FILENAME, merged);
  return merged;
}

/**
 * Get current budget config, or null if not configured.
 */
export function getBudget(): BudgetConfig | null {
  return readJsonFile<BudgetConfig>(BUDGET_FILENAME);
}

/**
 * Check if a payment amount (in smallest units) is within all budget limits.
 * maxPrice is in USDC (human-readable), e.g., "0.05".
 */
export function checkBudget(amountSmallest: string, maxPrice?: string): BudgetCheckResult {
  const budget = getBudget();
  const amount = BigInt(amountSmallest);

  // If no budget configured: require maxPrice as a fallback
  if (!budget) {
    if (!maxPrice) {
      return { allowed: false, reason: 'no_budget' };
    }
    // With maxPrice but no budget, check maxPrice only
    const maxPriceSmallest = BigInt(usdcToSmallest(maxPrice));
    if (amount > maxPriceSmallest) {
      return {
        allowed: false,
        reason: 'max_price',
        limit: maxPriceSmallest.toString(),
      };
    }
    return { allowed: true };
  }

  // Check per-request limit
  if (budget.perRequestMax) {
    const perRequestLimit = BigInt(usdcToSmallest(budget.perRequestMax));
    if (amount > perRequestLimit) {
      return {
        allowed: false,
        reason: 'per_request',
        limit: perRequestLimit.toString(),
      };
    }
  }

  // Check maxPrice flag (overrides per-request if more restrictive)
  if (maxPrice) {
    const maxPriceSmallest = BigInt(usdcToSmallest(maxPrice));
    if (amount > maxPriceSmallest) {
      return {
        allowed: false,
        reason: 'max_price',
        limit: maxPriceSmallest.toString(),
      };
    }
  }

  // Check daily and total limits (single file read for both)
  if (budget.dailyMax || budget.totalMax) {
    const totals = getSpendingTotals();

    if (budget.dailyMax) {
      const dailyLimit = BigInt(usdcToSmallest(budget.dailyMax));
      const todaySpent = BigInt(totals.today);
      if (todaySpent + amount > dailyLimit) {
        return {
          allowed: false,
          reason: 'daily',
          limit: dailyLimit.toString(),
          spent: todaySpent.toString(),
        };
      }
    }

    if (budget.totalMax) {
      const totalLimit = BigInt(usdcToSmallest(budget.totalMax));
      const lifetimeSpent = BigInt(totals.lifetime);
      if (lifetimeSpent + amount > totalLimit) {
        return {
          allowed: false,
          reason: 'total',
          limit: totalLimit.toString(),
          spent: lifetimeSpent.toString(),
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Strip undefined values from an object so Object.assign / spread merge works correctly.
 */
function filterUndefined(obj: Partial<BudgetConfig>): Partial<BudgetConfig> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<BudgetConfig>;
}
