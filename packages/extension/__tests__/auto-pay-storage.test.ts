import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStorageMock } from './helpers/storage-mock';

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

vi.stubGlobal('chrome', {
  storage: {
    local: localStorageMock,
    session: sessionStorageMock,
  },
});

import {
  getRules,
  trustSite,
  removeSite,
  updateSite,
  updateGlobals,
  addToDenylist,
  removeFromDenylist,
  toggleEnabled,
  deductSpending,
  initializeDefaults,
  dismissExplainer,
  checkAndDeduct,
  refundSpending,
} from '../src/background/auto-pay-storage';
import type { AutoPayRules } from '../src/background/auto-pay-storage';
import { _resetRateLimiterForTest } from '../src/background/auto-pay-rules';

// ── Helpers ──────────────────────────────────────────────────────

function makeRules(overrides: Partial<AutoPayRules> = {}): AutoPayRules {
  return {
    globalEnabled: true,
    dailyLimitRaw: '2000000',
    monthlyLimitRaw: '20000000',
    dailySpentRaw: '0',
    monthlySpentRaw: '0',
    dailyPeriodStart: Date.now(),
    monthlyPeriodStart: Date.now(),
    defaultSiteBudgetRaw: '500000',
    defaultMaxAmountRaw: '100000',
    sites: {},
    denylist: [],
    onboardingCompleted: false,
    explainerDismissed: false,
    ...overrides,
  };
}

async function seedRules(overrides: Partial<AutoPayRules> = {}): Promise<void> {
  await chrome.storage.local.set({ autoPayRules: makeRules(overrides) });
}

async function storedRules(): Promise<AutoPayRules> {
  const data = await chrome.storage.local.get('autoPayRules');
  return data['autoPayRules'] as AutoPayRules;
}

// ── Tests ────────────────────────────────────────────────────────

describe('auto-pay-storage', () => {
  beforeEach(() => {
    localStorageMock._reset();
    sessionStorageMock._reset();
    _resetRateLimiterForTest();
    vi.clearAllMocks();
  });

  // ── getRules ─────────────────────────────────────────────────

  describe('getRules', () => {
    it('returns defaults when no rules exist', async () => {
      const rules = await getRules();
      expect(rules.globalEnabled).toBe(true);
      expect(rules.dailyLimitRaw).toBe('2000000');
      expect(rules.monthlyLimitRaw).toBe('20000000');
      expect(rules.sites).toEqual({});
      expect(rules.denylist).toEqual([]);
    });

    it('returns stored rules when they exist', async () => {
      await seedRules({ dailyLimitRaw: '5000000' });
      const rules = await getRules();
      expect(rules.dailyLimitRaw).toBe('5000000');
    });

    it('applies daily reset when 24h elapsed', async () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;
      await seedRules({
        dailySpentRaw: '1000000',
        dailyPeriodStart: yesterday,
      });

      const rules = await getRules();
      expect(rules.dailySpentRaw).toBe('0');
      expect(rules.dailyPeriodStart).toBeGreaterThan(yesterday);
    });

    it('does NOT reset daily if under 24h', async () => {
      const recent = Date.now() - 12 * 60 * 60 * 1000;
      await seedRules({
        dailySpentRaw: '500000',
        dailyPeriodStart: recent,
      });

      const rules = await getRules();
      expect(rules.dailySpentRaw).toBe('500000');
      expect(rules.dailyPeriodStart).toBe(recent);
    });

    it('applies monthly reset when new calendar month', async () => {
      // Use a date from last month
      const now = new Date();
      const lastMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15),
      ).getTime();
      await seedRules({
        monthlySpentRaw: '5000000',
        monthlyPeriodStart: lastMonth,
      });

      const rules = await getRules();
      expect(rules.monthlySpentRaw).toBe('0');
      expect(rules.monthlyPeriodStart).toBeGreaterThan(lastMonth);
    });

    it('does NOT reset monthly within same calendar month', async () => {
      // Use fake timers set to mid-month so 5 days ago is the same month
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 15, 12, 0, 0))); // March 15, 2026
      const earlier = Date.now() - 5 * 24 * 60 * 60 * 1000; // March 10

      await seedRules({
        monthlySpentRaw: '3000000',
        monthlyPeriodStart: earlier,
      });

      const rules = await getRules();
      expect(rules.monthlySpentRaw).toBe('3000000');

      vi.useRealTimers();
    });

    it('resets per-site monthly spending on new month', async () => {
      const now = new Date();
      const lastMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15),
      ).getTime();
      await seedRules({
        sites: {
          'https://example.com': {
            origin: 'https://example.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '250000',
            monthlyPeriodStart: lastMonth,
            createdAt: lastMonth,
          },
        },
      });

      const rules = await getRules();
      const site = rules.sites['https://example.com']!;
      expect(site.monthlySpentRaw).toBe('0');
      expect(site.monthlyPeriodStart).toBeGreaterThan(lastMonth);
    });

    it('persists resets to storage', async () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;
      await seedRules({
        dailySpentRaw: '1000000',
        dailyPeriodStart: yesterday,
      });

      await getRules();

      const persisted = await storedRules();
      expect(persisted.dailySpentRaw).toBe('0');
    });
  });

  // ── trustSite ────────────────────────────────────────────────

  describe('trustSite', () => {
    it('adds a site with provided values', async () => {
      await seedRules();
      await trustSite('https://news.com', '50000', '1000000');

      const rules = await storedRules();
      const site = rules.sites['https://news.com']!;
      expect(site.origin).toBe('https://news.com');
      expect(site.maxAmountRaw).toBe('50000');
      expect(site.monthlyBudgetRaw).toBe('1000000');
      expect(site.monthlySpentRaw).toBe('0');
      expect(site.createdAt).toBeGreaterThan(0);
    });

    it('uses default site budget when none provided', async () => {
      await seedRules({ defaultSiteBudgetRaw: '750000' });
      await trustSite('https://blog.com', '100000');

      const rules = await storedRules();
      expect(rules.sites['https://blog.com']!.monthlyBudgetRaw).toBe('750000');
    });

    it('removes site from denylist when trusting', async () => {
      await seedRules({ denylist: ['https://bad.com', 'https://news.com'] });
      await trustSite('https://news.com', '50000');

      const rules = await storedRules();
      expect(rules.denylist).toEqual(['https://bad.com']);
      expect(rules.sites['https://news.com']).toBeDefined();
    });

    it('preserves existing sites when adding new one', async () => {
      await seedRules({
        sites: {
          'https://existing.com': {
            origin: 'https://existing.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '100000',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });
      await trustSite('https://new.com', '75000');

      const rules = await storedRules();
      expect(Object.keys(rules.sites)).toHaveLength(2);
      expect(rules.sites['https://existing.com']).toBeDefined();
      expect(rules.sites['https://new.com']).toBeDefined();
    });
  });

  // ── removeSite ───────────────────────────────────────────────

  describe('removeSite', () => {
    it('removes the specified site', async () => {
      await seedRules({
        sites: {
          'https://a.com': {
            origin: 'https://a.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await removeSite('https://a.com');
      const rules = await storedRules();
      expect(rules.sites['https://a.com']).toBeUndefined();
    });

    it('is a no-op for non-existent sites', async () => {
      await seedRules();
      await removeSite('https://nonexistent.com');
      const rules = await storedRules();
      expect(rules.sites).toEqual({});
    });
  });

  // ── updateSite ───────────────────────────────────────────────

  describe('updateSite', () => {
    it('updates maxAmountRaw', async () => {
      await seedRules({
        sites: {
          'https://a.com': {
            origin: 'https://a.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '100000',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await updateSite('https://a.com', { maxAmountRaw: '200000' });
      const rules = await storedRules();
      expect(rules.sites['https://a.com']!.maxAmountRaw).toBe('200000');
      // Other fields preserved
      expect(rules.sites['https://a.com']!.monthlySpentRaw).toBe('100000');
    });

    it('updates monthlyBudgetRaw', async () => {
      await seedRules({
        sites: {
          'https://a.com': {
            origin: 'https://a.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await updateSite('https://a.com', { monthlyBudgetRaw: '1000000' });
      const rules = await storedRules();
      expect(rules.sites['https://a.com']!.monthlyBudgetRaw).toBe('1000000');
    });

    it('is a no-op for non-existent sites', async () => {
      await seedRules();
      await updateSite('https://nonexistent.com', { maxAmountRaw: '200000' });
      const rules = await storedRules();
      expect(rules.sites).toEqual({});
    });
  });

  // ── updateGlobals ────────────────────────────────────────────

  describe('updateGlobals', () => {
    it('updates daily limit', async () => {
      await seedRules();
      await updateGlobals({ dailyLimitRaw: '5000000' });
      const rules = await storedRules();
      expect(rules.dailyLimitRaw).toBe('5000000');
    });

    it('updates monthly limit', async () => {
      await seedRules();
      await updateGlobals({ monthlyLimitRaw: '50000000' });
      const rules = await storedRules();
      expect(rules.monthlyLimitRaw).toBe('50000000');
    });

    it('updates default site budget', async () => {
      await seedRules();
      await updateGlobals({ defaultSiteBudgetRaw: '1000000' });
      const rules = await storedRules();
      expect(rules.defaultSiteBudgetRaw).toBe('1000000');
    });

    it('updates multiple fields at once', async () => {
      await seedRules();
      await updateGlobals({
        dailyLimitRaw: '5000000',
        monthlyLimitRaw: '50000000',
      });
      const rules = await storedRules();
      expect(rules.dailyLimitRaw).toBe('5000000');
      expect(rules.monthlyLimitRaw).toBe('50000000');
    });

    it('preserves other fields', async () => {
      await seedRules({ dailySpentRaw: '100000' });
      await updateGlobals({ dailyLimitRaw: '5000000' });
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('100000');
    });
  });

  // ── addToDenylist ────────────────────────────────────────────

  describe('addToDenylist', () => {
    it('adds origin to denylist', async () => {
      await seedRules();
      await addToDenylist('https://spam.com');
      const rules = await storedRules();
      expect(rules.denylist).toContain('https://spam.com');
    });

    it('removes from trusted sites when denylisting', async () => {
      await seedRules({
        sites: {
          'https://traitor.com': {
            origin: 'https://traitor.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await addToDenylist('https://traitor.com');
      const rules = await storedRules();
      expect(rules.denylist).toContain('https://traitor.com');
      expect(rules.sites['https://traitor.com']).toBeUndefined();
    });

    it('does not duplicate existing denylist entries', async () => {
      await seedRules({ denylist: ['https://spam.com'] });
      await addToDenylist('https://spam.com');
      const rules = await storedRules();
      expect(rules.denylist.filter((o) => o === 'https://spam.com')).toHaveLength(1);
    });
  });

  // ── removeFromDenylist ───────────────────────────────────────

  describe('removeFromDenylist', () => {
    it('removes origin from denylist', async () => {
      await seedRules({ denylist: ['https://spam.com', 'https://other.com'] });
      await removeFromDenylist('https://spam.com');
      const rules = await storedRules();
      expect(rules.denylist).toEqual(['https://other.com']);
    });

    it('is a no-op for non-existent entries', async () => {
      await seedRules({ denylist: ['https://spam.com'] });
      await removeFromDenylist('https://nonexistent.com');
      const rules = await storedRules();
      expect(rules.denylist).toEqual(['https://spam.com']);
    });
  });

  // ── toggleEnabled ────────────────────────────────────────────

  describe('toggleEnabled', () => {
    it('disables auto-pay', async () => {
      await seedRules({ globalEnabled: true });
      await toggleEnabled(false);
      const rules = await storedRules();
      expect(rules.globalEnabled).toBe(false);
    });

    it('enables auto-pay', async () => {
      await seedRules({ globalEnabled: false });
      await toggleEnabled(true);
      const rules = await storedRules();
      expect(rules.globalEnabled).toBe(true);
    });
  });

  // ── deductSpending ───────────────────────────────────────────

  describe('deductSpending', () => {
    it('deducts from global daily and monthly', async () => {
      await seedRules({
        dailySpentRaw: '100000',
        monthlySpentRaw: '500000',
      });

      await deductSpending('https://a.com', '10000');
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('110000');
      expect(rules.monthlySpentRaw).toBe('510000');
    });

    it('deducts from site monthly spending', async () => {
      await seedRules({
        sites: {
          'https://a.com': {
            origin: 'https://a.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '200000',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await deductSpending('https://a.com', '50000');
      const rules = await storedRules();
      expect(rules.sites['https://a.com']!.monthlySpentRaw).toBe('250000');
    });

    it('applies lazy resets before deduction', async () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;
      await seedRules({
        dailySpentRaw: '1000000',
        dailyPeriodStart: yesterday,
      });

      await deductSpending('https://a.com', '10000');
      const rules = await storedRules();
      // Daily was reset to 0, then 10000 added
      expect(rules.dailySpentRaw).toBe('10000');
    });

    it('works when site is not in trusted list', async () => {
      await seedRules();
      await deductSpending('https://unknown.com', '10000');
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('10000');
      expect(rules.monthlySpentRaw).toBe('10000');
    });

    it('handles large BigInt values correctly', async () => {
      await seedRules({ dailySpentRaw: '999999999999' });
      await deductSpending('https://a.com', '1');
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('1000000000000');
    });
  });

  // ── initializeDefaults ───────────────────────────────────────

  describe('initializeDefaults', () => {
    it('sets custom limits and marks onboarding complete', async () => {
      await initializeDefaults('3000000', '30000000', '750000');
      const rules = await storedRules();
      expect(rules.dailyLimitRaw).toBe('3000000');
      expect(rules.monthlyLimitRaw).toBe('30000000');
      expect(rules.defaultSiteBudgetRaw).toBe('750000');
      expect(rules.onboardingCompleted).toBe(true);
      expect(rules.dailyPeriodStart).toBeGreaterThan(0);
      expect(rules.monthlyPeriodStart).toBeGreaterThan(0);
    });

    it('preserves existing sites', async () => {
      await seedRules({
        sites: {
          'https://a.com': {
            origin: 'https://a.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await initializeDefaults('3000000', '30000000', '750000');
      const rules = await storedRules();
      expect(rules.sites['https://a.com']).toBeDefined();
    });
  });

  // ── dismissExplainer ─────────────────────────────────────────

  describe('dismissExplainer', () => {
    it('sets explainerDismissed to true', async () => {
      await seedRules({ explainerDismissed: false });
      await dismissExplainer();
      const rules = await storedRules();
      expect(rules.explainerDismissed).toBe(true);
    });
  });

  // ── trustSite error paths ──────────────────────────────────

  describe('trustSite validation', () => {
    it('rejects ftp:// origins', async () => {
      await seedRules();
      await expect(trustSite('ftp://files.com', '50000')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('rejects empty string', async () => {
      await seedRules();
      await expect(trustSite('', '50000')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('rejects origins without scheme', async () => {
      await seedRules();
      await expect(trustSite('example.com', '50000')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('rejects http:// origins', async () => {
      await seedRules();
      await expect(trustSite('http://example.com', '50000')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('stores normalized origin (lowercase) for mixed-case input', async () => {
      await seedRules();
      await trustSite('https://Example.Com', '50000');

      const rules = await storedRules();
      expect(rules.sites['https://example.com']).toBeDefined();
      expect(rules.sites['https://Example.Com']).toBeUndefined();
      expect(rules.sites['https://example.com']!.origin).toBe('https://example.com');
    });

    it('normalizes origin with trailing slash', async () => {
      await seedRules();
      await trustSite('https://Example.Com/', '50000');

      const rules = await storedRules();
      expect(rules.sites['https://example.com']).toBeDefined();
    });
  });

  // ── addToDenylist validation ───────────────────────────────

  describe('addToDenylist validation', () => {
    it('rejects ftp:// origins', async () => {
      await seedRules();
      await expect(addToDenylist('ftp://files.com')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('rejects empty string', async () => {
      await seedRules();
      await expect(addToDenylist('')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('rejects origins without scheme', async () => {
      await seedRules();
      await expect(addToDenylist('example.com')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('rejects http:// origins', async () => {
      await seedRules();
      await expect(addToDenylist('http://evil.com')).rejects.toThrow(
        'Invalid origin: must use HTTPS',
      );
    });

    it('stores normalized origin (lowercase) for mixed-case input', async () => {
      await seedRules();
      await addToDenylist('https://Evil.Com');

      const rules = await storedRules();
      expect(rules.denylist).toContain('https://evil.com');
      expect(rules.denylist).not.toContain('https://Evil.Com');
    });

    it('normalizes origin with trailing slash', async () => {
      await seedRules();
      await addToDenylist('https://Evil.Com/');

      const rules = await storedRules();
      expect(rules.denylist).toContain('https://evil.com');
    });
  });

  // ── checkAndDeduct ─────────────────────────────────────────

  describe('checkAndDeduct', () => {
    it('deducts on auto-pay action', async () => {
      // Wallet must be unlocked (session has privateKey)
      await sessionStorageMock.set({ privateKey: '0xabc' });

      await seedRules({
        globalEnabled: true,
        dailySpentRaw: '0',
        monthlySpentRaw: '0',
        dailyLimitRaw: '2000000',
        monthlyLimitRaw: '20000000',
        sites: {
          'https://news.com': {
            origin: 'https://news.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      const result = await checkAndDeduct('https://news.com', '10000');
      expect(result.action).toBe('auto-pay');

      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('10000');
      expect(rules.monthlySpentRaw).toBe('10000');
      expect(rules.sites['https://news.com']!.monthlySpentRaw).toBe('10000');
    });

    it('does NOT deduct on block action (denylisted site)', async () => {
      await seedRules({
        denylist: ['https://bad.com'],
      });

      const result = await checkAndDeduct('https://bad.com', '10000');
      expect(result.action).toBe('block');

      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('0');
      expect(rules.monthlySpentRaw).toBe('0');
    });

    it('does NOT deduct on prompt action (untrusted site)', async () => {
      await sessionStorageMock.set({ privateKey: '0xabc' });
      await seedRules({ globalEnabled: true });

      const result = await checkAndDeduct('https://unknown.com', '10000');
      expect(result.action).toBe('prompt');

      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('0');
    });

    it('does NOT deduct on skip action (wallet locked)', async () => {
      // No privateKey in session = wallet locked
      await seedRules({
        globalEnabled: true,
        sites: {
          'https://news.com': {
            origin: 'https://news.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      const result = await checkAndDeduct('https://news.com', '10000');
      expect(result.action).toBe('skip');

      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('0');
    });

    it('returns prompt for invalid priceRaw (BigInt parse failure)', async () => {
      await sessionStorageMock.set({ privateKey: '0xabc' });
      await seedRules({
        globalEnabled: true,
        sites: {
          'https://news.com': {
            origin: 'https://news.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      const result = await checkAndDeduct('https://news.com', 'not-a-number');
      expect(result.action).toBe('prompt');
      expect(result.reason).toBe('Invalid price value');
    });

    it('applies lazy resets before deduction', async () => {
      await sessionStorageMock.set({ privateKey: '0xabc' });
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;

      await seedRules({
        globalEnabled: true,
        dailySpentRaw: '1000000',
        dailyPeriodStart: yesterday,
        dailyLimitRaw: '2000000',
        monthlyLimitRaw: '20000000',
        sites: {
          'https://news.com': {
            origin: 'https://news.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      const result = await checkAndDeduct('https://news.com', '10000');
      expect(result.action).toBe('auto-pay');

      const rules = await storedRules();
      // Daily was reset to 0, then 10000 added
      expect(rules.dailySpentRaw).toBe('10000');
    });
  });

  // ── mixed-case normalization ────────────────────────────────

  describe('mixed-case origin normalization', () => {
    it('checkAndDeduct deducts site budget with mixed-case origin', async () => {
      await sessionStorageMock.set({ privateKey: '0xabc' });

      await seedRules({
        globalEnabled: true,
        dailySpentRaw: '0',
        monthlySpentRaw: '0',
        dailyLimitRaw: '2000000',
        monthlyLimitRaw: '20000000',
        sites: {
          'https://example.com': {
            origin: 'https://example.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      const result = await checkAndDeduct('https://Example.Com', '10000');
      expect(result.action).toBe('auto-pay');

      const rules = await storedRules();
      expect(rules.sites['https://example.com']!.monthlySpentRaw).toBe('10000');
    });

    it('removeSite removes with mixed-case origin', async () => {
      await seedRules({
        sites: {
          'https://example.com': {
            origin: 'https://example.com',
            maxAmountRaw: '50000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '0',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await removeSite('https://Example.Com');
      const rules = await storedRules();
      expect(rules.sites['https://example.com']).toBeUndefined();
    });

    it('removeFromDenylist removes with mixed-case origin', async () => {
      await seedRules({ denylist: ['https://spam.com', 'https://other.com'] });

      await removeFromDenylist('https://Spam.Com');
      const rules = await storedRules();
      expect(rules.denylist).toEqual(['https://other.com']);
    });
  });

  // ── refundSpending ─────────────────────────────────────────

  describe('refundSpending', () => {
    it('restores global daily and monthly spending', async () => {
      await seedRules({
        dailySpentRaw: '50000',
        monthlySpentRaw: '200000',
      });

      await refundSpending('https://a.com', '10000');
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('40000');
      expect(rules.monthlySpentRaw).toBe('190000');
    });

    it('restores site monthly spending', async () => {
      await seedRules({
        dailySpentRaw: '50000',
        monthlySpentRaw: '200000',
        sites: {
          'https://a.com': {
            origin: 'https://a.com',
            maxAmountRaw: '100000',
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '30000',
            monthlyPeriodStart: Date.now(),
            createdAt: Date.now(),
          },
        },
      });

      await refundSpending('https://a.com', '10000');
      const rules = await storedRules();
      expect(rules.sites['https://a.com']!.monthlySpentRaw).toBe('20000');
    });

    it('clamps to zero to avoid negative balances', async () => {
      await seedRules({
        dailySpentRaw: '5000',
        monthlySpentRaw: '5000',
      });

      await refundSpending('https://a.com', '10000');
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('0');
      expect(rules.monthlySpentRaw).toBe('0');
    });

    it('works when site is not in trusted list', async () => {
      await seedRules({
        dailySpentRaw: '50000',
        monthlySpentRaw: '200000',
      });

      await refundSpending('https://unknown.com', '10000');
      const rules = await storedRules();
      expect(rules.dailySpentRaw).toBe('40000');
      expect(rules.monthlySpentRaw).toBe('190000');
    });
  });
});
