import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStorageMock } from './helpers/storage-mock';
import type { AutoPayRules } from '../src/background/auto-pay-storage';

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

vi.stubGlobal('chrome', {
  storage: {
    local: localStorageMock,
    session: sessionStorageMock,
  },
});

import { checkAutoPayEligibility, _resetRateLimiterForTest } from '../src/background/auto-pay-rules';

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
    onboardingCompleted: true,
    explainerDismissed: false,
    ...overrides,
  };
}

function makeTrustedSite(origin: string, overrides: Record<string, unknown> = {}) {
  return {
    origin,
    maxAmountRaw: '100000',      // $0.10
    monthlyBudgetRaw: '500000',  // $0.50
    monthlySpentRaw: '0',
    monthlyPeriodStart: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

async function seedState(
  rules: Partial<AutoPayRules> = {},
  walletUnlocked = true,
): Promise<void> {
  await chrome.storage.local.set({ autoPayRules: makeRules(rules) });
  if (walletUnlocked) {
    await chrome.storage.session.set({ privateKey: '0xfakekey' });
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe('auto-pay-rules', () => {
  beforeEach(() => {
    localStorageMock._reset();
    sessionStorageMock._reset();
    _resetRateLimiterForTest();
    vi.clearAllMocks();
  });

  // ── Step 1: Denylist ─────────────────────────────────────────

  describe('Step 1: Denylist', () => {
    it('blocks denylisted origins', async () => {
      await seedState({ denylist: ['https://spam.com'] });
      const result = await checkAutoPayEligibility('https://spam.com', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toContain('denylist');
    });

    it('denylist check takes priority over all other checks', async () => {
      // Even with wallet locked, trusted site, etc — denylist wins
      await seedState(
        {
          denylist: ['https://spam.com'],
          sites: { 'https://spam.com': makeTrustedSite('https://spam.com') },
        },
        false,
      );
      const result = await checkAutoPayEligibility('https://spam.com', '10000');
      expect(result.action).toBe('block');
    });
  });

  // ── Step 2: Wallet unlock ────────────────────────────────────

  describe('Step 2: Wallet unlock', () => {
    it('skips when wallet is locked', async () => {
      await seedState({}, false);
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('skip');
      expect(result.reason).toContain('locked');
    });

    it('proceeds when wallet is unlocked', async () => {
      await seedState({
        sites: { 'https://example.com': makeTrustedSite('https://example.com') },
      });
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('auto-pay');
    });
  });

  // ── Step 3: Global enabled ───────────────────────────────────

  describe('Step 3: Global enabled', () => {
    it('prompts when auto-pay is disabled', async () => {
      await seedState({ globalEnabled: false });
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('prompt');
      expect(result.reason).toContain('paused');
    });
  });

  // ── Step 4: Trusted site ─────────────────────────────────────

  describe('Step 4: Trusted site', () => {
    it('prompts for untrusted sites', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('https://unknown.com', '10000');
      expect(result.action).toBe('prompt');
      expect(result.reason).toContain('not trusted');
    });
  });

  // ── Step 5: Price tier ───────────────────────────────────────

  describe('Step 5: Price tier', () => {
    it('prompts when price exceeds max amount', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com', {
            maxAmountRaw: '50000', // $0.05
          }),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '75000');
      expect(result.action).toBe('prompt-price-increased');
      expect(result.reason).toContain('max amount');
    });

    it('passes when price equals max amount', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com', {
            maxAmountRaw: '50000',
          }),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '50000');
      expect(result.action).toBe('auto-pay');
    });

    it('passes when price is below max amount', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com', {
            maxAmountRaw: '100000',
          }),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '50000');
      expect(result.action).toBe('auto-pay');
    });
  });

  // ── Step 6: Per-site monthly budget ──────────────────────────

  describe('Step 6: Per-site monthly budget', () => {
    it('prompts when site budget would be exceeded', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com', {
            monthlyBudgetRaw: '500000',  // $0.50
            monthlySpentRaw: '495000',   // $0.495 spent
          }),
        },
      });

      // $0.01 would exceed remaining $0.005
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('prompt-budget-exceeded');
      expect(result.reason).toContain('Site monthly budget');
    });

    it('passes when site budget has room', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com', {
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '100000',
          }),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('auto-pay');
    });

    it('passes when spending exactly matches remaining budget', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com', {
            monthlyBudgetRaw: '500000',
            monthlySpentRaw: '490000',
          }),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('auto-pay');
    });
  });

  // ── Step 7: Global daily budget ──────────────────────────────

  describe('Step 7: Global daily budget', () => {
    it('prompts when daily budget would be exceeded', async () => {
      await seedState({
        dailyLimitRaw: '2000000',    // $2.00
        dailySpentRaw: '1995000',    // $1.995 spent
        sites: {
          'https://example.com': makeTrustedSite('https://example.com'),
        },
      });

      // $0.01 would exceed remaining $0.005
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('prompt-budget-exceeded');
      expect(result.reason).toContain('daily');
    });

    it('passes when daily budget has room', async () => {
      await seedState({
        dailyLimitRaw: '2000000',
        dailySpentRaw: '1000000',
        sites: {
          'https://example.com': makeTrustedSite('https://example.com'),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('auto-pay');
    });
  });

  // ── Step 8: Global monthly budget ────────────────────────────

  describe('Step 8: Global monthly budget', () => {
    it('prompts when monthly budget would be exceeded', async () => {
      await seedState({
        monthlyLimitRaw: '20000000',    // $20.00
        monthlySpentRaw: '19995000',    // $19.995 spent
        sites: {
          'https://example.com': makeTrustedSite('https://example.com'),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('prompt-budget-exceeded');
      expect(result.reason).toContain('monthly');
    });
  });

  // ── Step 9: All pass ─────────────────────────────────────────

  describe('Step 9: All pass → auto-pay', () => {
    it('returns auto-pay when all checks pass', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com'),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('auto-pay');
      expect(result.reason).toBeUndefined();
    });
  });

  // ── Step 0: Origin validation ────────────────────────────────

  describe('Step 0: Origin validation', () => {
    it('blocks HTTP origins with insecure-scheme', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('http://example.com', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('insecure-scheme');
    });

    it('blocks private IP origins with private-network', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('https://192.168.1.1', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('private-network');
    });

    it('blocks localhost origins with private-network', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('https://localhost', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('private-network');
    });

    it('blocks file:// origins with insecure-scheme', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('file:///etc/passwd', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('insecure-scheme');
    });

    it('blocks data: origins with insecure-scheme', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('data:text/html,<h1>hi</h1>', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('insecure-scheme');
    });

    it('blocks blob: origins with insecure-scheme', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('blob:https://evil.com/uuid', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('insecure-scheme');
    });

    it('blocks malformed origins', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('not-a-url', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('malformed');
    });

    it('allows HTTPS public origins through to the rest of the chain', async () => {
      await seedState({
        sites: { 'https://example.com': makeTrustedSite('https://example.com') },
      });
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('auto-pay');
    });

    it('blocks https://10.0.0.1 (private Class A)', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('https://10.0.0.1', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('private-network');
    });

    it('blocks https://127.0.0.1 (loopback)', async () => {
      await seedState();
      const result = await checkAutoPayEligibility('https://127.0.0.1', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('private-network');
    });
  });

  // ── Step 1: Rate limiter ───────────────────────────────────

  describe('Step 1: Rate limiter', () => {
    it('allows up to 5 calls to same origin', async () => {
      await seedState({
        sites: { 'https://example.com': makeTrustedSite('https://example.com') },
      });

      for (let i = 0; i < 5; i++) {
        const result = await checkAutoPayEligibility('https://example.com', '10000');
        expect(result.action).toBe('auto-pay');
      }
    });

    it('blocks the 6th call to the same origin within the window', async () => {
      await seedState({
        sites: { 'https://example.com': makeTrustedSite('https://example.com') },
      });

      for (let i = 0; i < 5; i++) {
        await checkAutoPayEligibility('https://example.com', '10000');
      }

      const result = await checkAutoPayEligibility('https://example.com', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toBe('rate-limited');
    });

    it('allows requests again after the 60s window expires', async () => {
      vi.useFakeTimers();

      await seedState({
        sites: { 'https://example.com': makeTrustedSite('https://example.com') },
      });

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await checkAutoPayEligibility('https://example.com', '10000');
      }

      const blocked = await checkAutoPayEligibility('https://example.com', '10000');
      expect(blocked.action).toBe('block');
      expect(blocked.reason).toBe('rate-limited');

      // Advance time past the 60s window
      vi.advanceTimersByTime(61_000);

      const allowed = await checkAutoPayEligibility('https://example.com', '10000');
      expect(allowed.action).toBe('auto-pay');

      vi.useRealTimers();
    });

    it('rate limits are per-origin (different origins have separate limits)', async () => {
      await seedState({
        sites: {
          'https://site-a.com': makeTrustedSite('https://site-a.com'),
          'https://site-b.com': makeTrustedSite('https://site-b.com'),
        },
      });

      // Exhaust limit for site-a
      for (let i = 0; i < 5; i++) {
        await checkAutoPayEligibility('https://site-a.com', '10000');
      }

      // site-b should still work
      const result = await checkAutoPayEligibility('https://site-b.com', '10000');
      expect(result.action).toBe('auto-pay');
    });
  });

  // ── Normalized origin matching ─────────────────────────────

  describe('Normalized origin matching', () => {
    it('matches trusted site with different casing', async () => {
      await seedState({
        sites: { 'https://example.com': makeTrustedSite('https://example.com') },
      });

      // Request from mixed-case URL — normalizeOrigin should match the lowercase stored key
      const result = await checkAutoPayEligibility('https://Example.Com', '10000');
      expect(result.action).toBe('auto-pay');
    });

    it('matches denylist with different casing', async () => {
      await seedState({
        denylist: ['https://spam.com'],
      });

      const result = await checkAutoPayEligibility('https://Spam.Com', '10000');
      expect(result.action).toBe('block');
      expect(result.reason).toContain('denylist');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles zero price', async () => {
      await seedState({
        sites: {
          'https://example.com': makeTrustedSite('https://example.com'),
        },
      });

      const result = await checkAutoPayEligibility('https://example.com', '0');
      expect(result.action).toBe('auto-pay');
    });

    it('handles zero budget remaining', async () => {
      await seedState({
        dailyLimitRaw: '100000',
        dailySpentRaw: '100000', // exactly at limit
        sites: {
          'https://example.com': makeTrustedSite('https://example.com'),
        },
      });

      // Even $0.000001 would exceed
      const result = await checkAutoPayEligibility('https://example.com', '1');
      expect(result.action).toBe('prompt-budget-exceeded');
    });

    it('handles missing rules (first-run)', async () => {
      // No rules seeded — should get defaults
      await chrome.storage.session.set({ privateKey: '0xfakekey' });
      const result = await checkAutoPayEligibility('https://example.com', '10000');
      // No trusted sites in defaults
      expect(result.action).toBe('prompt');
    });

    it('decision chain stops at first failing check', async () => {
      // Site is denylisted AND wallet is locked — should block (step 1), not skip (step 2)
      await seedState({ denylist: ['https://spam.com'] }, false);
      const result = await checkAutoPayEligibility('https://spam.com', '10000');
      expect(result.action).toBe('block');
    });
  });
});
