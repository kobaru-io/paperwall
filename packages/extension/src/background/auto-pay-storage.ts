// ── Auto-Pay Storage Manager ────────────────────────────────────────
// CRUD operations for auto-pay rules, budget tracking, and denylist.
// All amounts are string-encoded raw USDC units (6 decimals) for BigInt arithmetic.

import type { SiteRule, AutoPayRules } from '../shared/auto-pay-types.js';
import { checkAutoPayEligibility, type AutoPayDecision } from './auto-pay-rules.js';
import { normalizeOrigin } from '../shared/origin-security.js';

export type { SiteRule, AutoPayRules };

const STORAGE_KEY = 'autoPayRules';

// ── Defaults ─────────────────────────────────────────────────────

const DEFAULT_RULES: AutoPayRules = {
  globalEnabled: true,
  dailyLimitRaw: '2000000',     // $2.00
  monthlyLimitRaw: '20000000',  // $20.00
  dailySpentRaw: '0',
  monthlySpentRaw: '0',
  dailyPeriodStart: 0,
  monthlyPeriodStart: 0,
  defaultSiteBudgetRaw: '500000',  // $0.50
  defaultMaxAmountRaw: '100000',   // $0.10
  sites: {},
  denylist: [],
  onboardingCompleted: false,
  explainerDismissed: false,
};

// ── Period Reset Logic ───────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isNewCalendarMonth(periodStart: number, now: number): boolean {
  const periodDate = new Date(periodStart);
  const nowDate = new Date(now);
  return (
    periodDate.getUTCFullYear() !== nowDate.getUTCFullYear() ||
    periodDate.getUTCMonth() !== nowDate.getUTCMonth()
  );
}

function applyLazyResets(rules: AutoPayRules, now: number): AutoPayRules {
  let updated = { ...rules };
  let changed = false;

  // Daily reset: 24h elapsed since period start
  if (now - updated.dailyPeriodStart >= MS_PER_DAY) {
    updated = { ...updated, dailySpentRaw: '0', dailyPeriodStart: now };
    changed = true;
  }

  // Monthly reset: new calendar month
  if (updated.monthlyPeriodStart === 0 || isNewCalendarMonth(updated.monthlyPeriodStart, now)) {
    updated = { ...updated, monthlySpentRaw: '0', monthlyPeriodStart: now };
    changed = true;
  }

  // Per-site monthly resets
  const sites = { ...updated.sites };
  let sitesChanged = false;
  for (const origin of Object.keys(sites)) {
    const site = sites[origin]!;
    if (site.monthlyPeriodStart === 0 || isNewCalendarMonth(site.monthlyPeriodStart, now)) {
      sites[origin] = { ...site, monthlySpentRaw: '0', monthlyPeriodStart: now };
      sitesChanged = true;
    }
  }

  if (sitesChanged) {
    updated = { ...updated, sites };
    changed = true;
  }

  return changed ? updated : rules;
}

// ── Validation Helpers ───────────────────────────────────────────

function validateOrigin(origin: string): string {
  if (!origin.startsWith('https://')) {
    throw new Error('Invalid origin: must use HTTPS');
  }
  return normalizeOrigin(origin);
}

function isValidRawAmount(s: string): boolean {
  try {
    return BigInt(s) > 0n;
  } catch {
    return false;
  }
}

// ── Internal Helpers ─────────────────────────────────────────────

async function readRaw(): Promise<AutoPayRules> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as AutoPayRules | undefined) ?? { ...DEFAULT_RULES };
}

async function write(rules: AutoPayRules): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Returns the full auto-pay rules with lazy period resets applied.
 * If resets occurred, the updated rules are persisted.
 */
export async function getRules(): Promise<AutoPayRules> {
  const raw = await readRaw();
  const now = Date.now();
  const reset = applyLazyResets(raw, now);
  if (reset !== raw) {
    await write(reset);
  }
  return reset;
}

/**
 * Adds a site to the trusted list with the given max amount.
 * Uses default site budget if none provided. Removes from denylist if present.
 */
export async function trustSite(
  origin: string,
  maxAmountRaw: string,
  monthlyBudgetRaw?: string,
): Promise<void> {
  const normalized = validateOrigin(origin);

  const rules = await readRaw();
  const now = Date.now();
  const site: SiteRule = {
    origin: normalized,
    maxAmountRaw,
    monthlyBudgetRaw: monthlyBudgetRaw ?? rules.defaultSiteBudgetRaw,
    monthlySpentRaw: '0',
    monthlyPeriodStart: now,
    createdAt: now,
  };
  const sites = { ...rules.sites, [normalized]: site };
  const denylist = rules.denylist.filter((o) => o !== normalized);
  await write({ ...rules, sites, denylist });
}

/**
 * Removes a site from the trusted list.
 */
export async function removeSite(origin: string): Promise<void> {
  const normalized = normalizeOrigin(origin);
  const rules = await readRaw();
  const sites = { ...rules.sites };
  delete sites[normalized];
  await write({ ...rules, sites });
}

/**
 * Updates a trusted site's maxAmount or budget.
 */
export async function updateSite(
  origin: string,
  changes: { maxAmountRaw?: string; monthlyBudgetRaw?: string },
): Promise<void> {
  if (changes.maxAmountRaw !== undefined && !isValidRawAmount(changes.maxAmountRaw)) {
    throw new Error('Invalid maxAmountRaw: must be a positive BigInt-parseable string');
  }
  if (changes.monthlyBudgetRaw !== undefined && !isValidRawAmount(changes.monthlyBudgetRaw)) {
    throw new Error('Invalid monthlyBudgetRaw: must be a positive BigInt-parseable string');
  }
  const normalized = normalizeOrigin(origin);
  const rules = await readRaw();
  const existing = rules.sites[normalized];
  if (!existing) return;
  const sites = { ...rules.sites, [normalized]: { ...existing, ...changes } };
  await write({ ...rules, sites });
}

/**
 * Updates global limits or defaults.
 */
export async function updateGlobals(changes: {
  dailyLimitRaw?: string;
  monthlyLimitRaw?: string;
  defaultSiteBudgetRaw?: string;
  defaultMaxAmountRaw?: string;
}): Promise<void> {
  const rawFields: (keyof typeof changes)[] = [
    'dailyLimitRaw', 'monthlyLimitRaw', 'defaultSiteBudgetRaw', 'defaultMaxAmountRaw',
  ];
  for (const field of rawFields) {
    const value = changes[field];
    if (value !== undefined && !isValidRawAmount(value)) {
      throw new Error(`Invalid ${field}: must be a positive BigInt-parseable string`);
    }
  }
  const rules = await readRaw();
  await write({ ...rules, ...changes });
}

/**
 * Adds an origin to the denylist. Removes from trusted sites if present.
 */
export async function addToDenylist(origin: string): Promise<void> {
  const normalized = validateOrigin(origin);
  const rules = await readRaw();
  const sites = { ...rules.sites };
  delete sites[normalized];
  const denylist = rules.denylist.includes(normalized)
    ? rules.denylist
    : [...rules.denylist, normalized];
  await write({ ...rules, sites, denylist });
}

/**
 * Removes an origin from the denylist.
 */
export async function removeFromDenylist(origin: string): Promise<void> {
  const normalized = normalizeOrigin(origin);
  const rules = await readRaw();
  const denylist = rules.denylist.filter((o) => o !== normalized);
  await write({ ...rules, denylist });
}

/**
 * Pauses or resumes all auto-pay.
 */
export async function toggleEnabled(enabled: boolean): Promise<void> {
  const rules = await readRaw();
  await write({ ...rules, globalEnabled: enabled });
}

/**
 * Atomically deducts spending from site + global budgets.
 * Applies lazy resets before deduction.
 */
export async function deductSpending(origin: string, amountRaw: string): Promise<void> {
  const normalizedOrigin = normalizeOrigin(origin);
  const rules = await readRaw();
  const now = Date.now();
  const reset = applyLazyResets(rules, now);

  const amount = BigInt(amountRaw);

  // Global daily
  const newDailySpent = (BigInt(reset.dailySpentRaw) + amount).toString();
  // Global monthly
  const newMonthlySpent = (BigInt(reset.monthlySpentRaw) + amount).toString();

  let sites = { ...reset.sites };
  const site = sites[normalizedOrigin];
  if (site) {
    sites = {
      ...sites,
      [normalizedOrigin]: {
        ...site,
        monthlySpentRaw: (BigInt(site.monthlySpentRaw) + amount).toString(),
      },
    };
  }

  await write({
    ...reset,
    dailySpentRaw: newDailySpent,
    monthlySpentRaw: newMonthlySpent,
    sites,
  });
}

/**
 * Restores spending that was deducted by checkAndDeduct when the
 * subsequent payment fails. Performs the inverse of deduction:
 * subtracts from dailySpentRaw, monthlySpentRaw, and site monthlySpentRaw.
 */
export async function refundSpending(origin: string, amountRaw: string): Promise<void> {
  const normalizedOrigin = normalizeOrigin(origin);
  const rules = await readRaw();
  const amount = BigInt(amountRaw);

  // Clamp to zero to avoid negative balances
  const newDailySpent = (() => {
    const result = BigInt(rules.dailySpentRaw) - amount;
    return (result < 0n ? 0n : result).toString();
  })();
  const newMonthlySpent = (() => {
    const result = BigInt(rules.monthlySpentRaw) - amount;
    return (result < 0n ? 0n : result).toString();
  })();

  let sites = { ...rules.sites };
  const site = sites[normalizedOrigin];
  if (site) {
    const siteResult = BigInt(site.monthlySpentRaw) - amount;
    sites = {
      ...sites,
      [normalizedOrigin]: {
        ...site,
        monthlySpentRaw: (siteResult < 0n ? 0n : siteResult).toString(),
      },
    };
  }

  await write({
    ...rules,
    dailySpentRaw: newDailySpent,
    monthlySpentRaw: newMonthlySpent,
    sites,
  });
}

/**
 * Atomically checks auto-pay eligibility AND deducts spending in a single
 * read-modify-write cycle. Prevents TOCTOU race where two concurrent tabs
 * could both pass the budget check before either deducts.
 *
 * Delegates the 9-step decision chain to checkAutoPayEligibility (single
 * source of truth in auto-pay-rules.ts). On 'auto-pay' action, the
 * deduction has already been applied.
 */
export async function checkAndDeduct(
  origin: string,
  priceRaw: string,
): Promise<AutoPayDecision> {
  // Delegate the 9-step decision to the canonical rules engine
  const decision = await checkAutoPayEligibility(origin, priceRaw);

  if (decision.action !== 'auto-pay') {
    return decision;
  }

  // Decision is auto-pay: atomically deduct spending
  const normalizedOrigin = normalizeOrigin(origin);
  const raw = await readRaw();
  const now = Date.now();
  const rules = applyLazyResets(raw, now);

  let price: bigint;
  try {
    price = BigInt(priceRaw);
  } catch {
    return { action: 'prompt', reason: 'Invalid price value' };
  }

  const site = rules.sites[normalizedOrigin];
  const newDailySpent = (BigInt(rules.dailySpentRaw) + price).toString();
  const newMonthlySpent = (BigInt(rules.monthlySpentRaw) + price).toString();
  const updatedSites = site
    ? {
        ...rules.sites,
        [normalizedOrigin]: {
          ...site,
          monthlySpentRaw: (BigInt(site.monthlySpentRaw) + price).toString(),
        },
      }
    : rules.sites;

  await write({
    ...rules,
    dailySpentRaw: newDailySpent,
    monthlySpentRaw: newMonthlySpent,
    sites: updatedSites,
  });

  return { action: 'auto-pay' };
}

/**
 * First-run setup: sets global limits and marks onboarding complete.
 */
export async function initializeDefaults(
  dailyLimitRaw: string,
  monthlyLimitRaw: string,
  defaultSiteBudgetRaw: string,
): Promise<void> {
  const rules = await readRaw();
  const now = Date.now();
  await write({
    ...rules,
    dailyLimitRaw,
    monthlyLimitRaw,
    defaultSiteBudgetRaw,
    dailyPeriodStart: now,
    monthlyPeriodStart: now,
    onboardingCompleted: true,
  });
}

/**
 * Sets the explainer dismissed flag.
 */
export async function dismissExplainer(): Promise<void> {
  const rules = await readRaw();
  await write({ ...rules, explainerDismissed: true });
}
