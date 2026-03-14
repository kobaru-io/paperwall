// ── Auto-Pay Rules Engine ───────────────────────────────────────────
// Decision engine that evaluates whether a page should be auto-paid,
// prompted, or blocked. Called from the service worker on page detection.

import { getRules } from './auto-pay-storage';
import { validatePaymentOrigin, normalizeOrigin } from '../shared/origin-security';

// ── Types ────────────────────────────────────────────────────────

export type AutoPayAction =
  | 'auto-pay'
  | 'prompt'
  | 'prompt-budget-exceeded'
  | 'prompt-price-increased'
  | 'block'
  | 'skip';

export interface AutoPayDecision {
  action: AutoPayAction;
  reason?: string;
}

// ── Rate Limiter ─────────────────────────────────────────────────

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(origin: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(origin);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(origin, { count: 1, windowStart: now });
    pruneRateLimitMap(now);
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function pruneRateLimitMap(now: number): void {
  if (rateLimitMap.size > 100) {
    for (const [key, val] of rateLimitMap) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        rateLimitMap.delete(key);
      }
    }
  }
}

// ── Wallet Unlock Check ──────────────────────────────────────────

async function isWalletUnlocked(): Promise<boolean> {
  const data = await chrome.storage.session.get('privateKey');
  return data['privateKey'] !== undefined && data['privateKey'] !== null;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Evaluates the 9-step decision chain to determine whether a page
 * should be auto-paid, prompted, or blocked.
 *
 * Decision chain (strict order):
 * 1. Denylist check → block
 * 2. Wallet unlock check → skip
 * 3. Global enabled check → prompt
 * 4. Trusted site check → prompt
 * 5. Price-tier check → prompt-price-increased
 * 6. Per-site monthly budget → prompt-budget-exceeded
 * 7. Global daily budget → prompt-budget-exceeded
 * 8. Global monthly budget → prompt-budget-exceeded
 * 9. All pass → auto-pay
 */
export async function checkAutoPayEligibility(
  origin: string,
  priceRaw: string,
): Promise<AutoPayDecision> {
  // Step 0: Origin validation
  const validation = validatePaymentOrigin(origin);
  if (!validation.valid) {
    return { action: 'block', reason: validation.reason };
  }

  const normalizedOrigin = normalizeOrigin(origin);

  // Step 1: Rate limit
  if (!checkRateLimit(normalizedOrigin)) {
    return { action: 'block', reason: 'rate-limited' };
  }

  let price: bigint;
  try {
    price = BigInt(priceRaw);
  } catch {
    return { action: 'prompt', reason: 'Invalid price value' };
  }

  const rules = await getRules();

  // Step 2: Denylist
  if (rules.denylist.includes(normalizedOrigin)) {
    return { action: 'block', reason: 'Site is in denylist' };
  }

  // Step 3: Wallet unlock
  const unlocked = await isWalletUnlocked();
  if (!unlocked) {
    return { action: 'skip', reason: 'Wallet is locked' };
  }

  // Step 4: Global enabled
  if (!rules.globalEnabled) {
    return { action: 'prompt', reason: 'Auto-pay is paused' };
  }

  // Step 5: Trusted site
  const site = rules.sites[normalizedOrigin];
  if (!site) {
    return { action: 'prompt', reason: 'Site is not trusted' };
  }

  // Step 6: Price-tier
  if (price > BigInt(site.maxAmountRaw)) {
    return {
      action: 'prompt-price-increased',
      reason: `Price exceeds max amount (${site.maxAmountRaw})`,
    };
  }

  // Step 7: Per-site monthly budget
  const siteRemaining = BigInt(site.monthlyBudgetRaw) - BigInt(site.monthlySpentRaw);
  if (price > siteRemaining) {
    return {
      action: 'prompt-budget-exceeded',
      reason: `Site monthly budget exceeded`,
    };
  }

  // Step 8: Global daily budget
  const dailyRemaining = BigInt(rules.dailyLimitRaw) - BigInt(rules.dailySpentRaw);
  if (price > dailyRemaining) {
    return {
      action: 'prompt-budget-exceeded',
      reason: 'Global daily budget exceeded',
    };
  }

  // Step 9: Global monthly budget
  const monthlyRemaining = BigInt(rules.monthlyLimitRaw) - BigInt(rules.monthlySpentRaw);
  if (price > monthlyRemaining) {
    return {
      action: 'prompt-budget-exceeded',
      reason: 'Global monthly budget exceeded',
    };
  }

  // Step 10: All checks pass
  return { action: 'auto-pay' };
}

export function _resetRateLimiterForTest(): void {
  rateLimitMap.clear();
}
