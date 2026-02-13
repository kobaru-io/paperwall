import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  setBudget,
  getBudget,
  checkBudget,
  usdcToSmallest,
  smallestToUsdc,
} from './budget.js';

import type { BudgetConfig } from './budget.js';

import { appendPayment } from './history.js';

describe('budget', () => {
  let originalHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-budget-test-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('usdcToSmallest', () => {
    it('should convert "0.01" to "10000"', () => {
      expect(usdcToSmallest('0.01')).toBe('10000');
    });

    it('should convert "1.00" to "1000000"', () => {
      expect(usdcToSmallest('1.00')).toBe('1000000');
    });

    it('should convert "5.00" to "5000000"', () => {
      expect(usdcToSmallest('5.00')).toBe('5000000');
    });

    it('should convert "50.00" to "50000000"', () => {
      expect(usdcToSmallest('50.00')).toBe('50000000');
    });

    it('should convert "0.000001" to "1"', () => {
      expect(usdcToSmallest('0.000001')).toBe('1');
    });

    it('should convert "100" to "100000000"', () => {
      expect(usdcToSmallest('100')).toBe('100000000');
    });

    it('should handle "0.50" correctly', () => {
      expect(usdcToSmallest('0.50')).toBe('500000');
    });
  });

  describe('smallestToUsdc', () => {
    it('should convert "10000" to "0.01"', () => {
      expect(smallestToUsdc('10000')).toBe('0.01');
    });

    it('should convert "1000000" to "1.00"', () => {
      expect(smallestToUsdc('1000000')).toBe('1.00');
    });

    it('should convert "5000000" to "5.00"', () => {
      expect(smallestToUsdc('5000000')).toBe('5.00');
    });

    it('should convert "0" to "0.00"', () => {
      expect(smallestToUsdc('0')).toBe('0.00');
    });

    it('should convert "1" to "0.000001"', () => {
      expect(smallestToUsdc('1')).toBe('0.000001');
    });

    it('should convert "50000000" to "50.00"', () => {
      expect(smallestToUsdc('50000000')).toBe('50.00');
    });
  });

  describe('setBudget', () => {
    it('should create budget.json with provided limits', () => {
      const result = setBudget({ dailyMax: '5.00', totalMax: '50.00' });
      expect(result).toEqual({ dailyMax: '5.00', totalMax: '50.00' });
    });

    it('should merge with existing budget', () => {
      setBudget({ perRequestMax: '1.00' });
      const result = setBudget({ dailyMax: '5.00' });
      expect(result).toEqual({ perRequestMax: '1.00', dailyMax: '5.00' });
    });

    it('should override existing field on re-set', () => {
      setBudget({ dailyMax: '5.00' });
      const result = setBudget({ dailyMax: '10.00' });
      expect(result).toEqual({ dailyMax: '10.00' });
    });

    it('should persist to disk', () => {
      setBudget({ perRequestMax: '1.00', dailyMax: '5.00', totalMax: '50.00' });
      const stored = getBudget();
      expect(stored).toEqual({
        perRequestMax: '1.00',
        dailyMax: '5.00',
        totalMax: '50.00',
      });
    });
  });

  describe('getBudget', () => {
    it('should return null when no budget configured', () => {
      expect(getBudget()).toBeNull();
    });

    it('should return budget config after set', () => {
      setBudget({ perRequestMax: '1.00', dailyMax: '5.00', totalMax: '50.00' });
      const budget = getBudget();
      expect(budget).toEqual({
        perRequestMax: '1.00',
        dailyMax: '5.00',
        totalMax: '50.00',
      });
    });
  });

  describe('checkBudget', () => {
    it('should allow when no budget configured and maxPrice covers it', () => {
      const result = checkBudget('10000', '0.05');
      expect(result.allowed).toBe(true);
    });

    it('should reject when no budget configured and no maxPrice', () => {
      const result = checkBudget('10000');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('no_budget');
    });

    describe('per-request limit', () => {
      it('should allow when amount is within per-request limit', () => {
        setBudget({ perRequestMax: '1.00' });
        const result = checkBudget('500000'); // 0.50 USDC
        expect(result.allowed).toBe(true);
      });

      it('should reject when amount exceeds per-request limit', () => {
        setBudget({ perRequestMax: '1.00' });
        const result = checkBudget('2000000'); // 2.00 USDC
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('per_request');
        expect(result.limit).toBe('1000000');
      });

      it('should allow when amount equals per-request limit exactly', () => {
        setBudget({ perRequestMax: '1.00' });
        const result = checkBudget('1000000'); // exactly 1.00 USDC
        expect(result.allowed).toBe(true);
      });
    });

    describe('max-price limit', () => {
      it('should reject when amount exceeds maxPrice', () => {
        setBudget({ perRequestMax: '10.00' });
        const result = checkBudget('100000', '0.05'); // 0.10 USDC, max 0.05
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('max_price');
      });

      it('should allow when amount is within maxPrice', () => {
        setBudget({ perRequestMax: '10.00' });
        const result = checkBudget('10000', '0.05'); // 0.01 USDC, max 0.05
        expect(result.allowed).toBe(true);
      });
    });

    describe('daily limit', () => {
      it('should reject when today total + amount exceeds daily limit', () => {
        setBudget({ dailyMax: '5.00' });

        // Add existing payments for today
        appendPayment({
          ts: new Date().toISOString(),
          url: 'https://example.com/1',
          amount: '4500000', // 4.50 USDC
          asset: 'USDC',
          network: 'eip155:324705682',
          txHash: '0xaaa',
          mode: 'client',
        });

        const result = checkBudget('1000000'); // try to add 1.00 USDC (total would be 5.50)
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('daily');
        expect(result.spent).toBe('4500000');
      });

      it('should allow when today total + amount is within daily limit', () => {
        setBudget({ dailyMax: '5.00' });

        appendPayment({
          ts: new Date().toISOString(),
          url: 'https://example.com/1',
          amount: '3000000', // 3.00 USDC
          asset: 'USDC',
          network: 'eip155:324705682',
          txHash: '0xaaa',
          mode: 'client',
        });

        const result = checkBudget('1000000'); // 1.00 USDC (total 4.00 <= 5.00)
        expect(result.allowed).toBe(true);
      });

      it('should allow when today total + amount equals daily limit exactly', () => {
        setBudget({ dailyMax: '5.00' });

        appendPayment({
          ts: new Date().toISOString(),
          url: 'https://example.com/1',
          amount: '4000000', // 4.00 USDC
          asset: 'USDC',
          network: 'eip155:324705682',
          txHash: '0xaaa',
          mode: 'client',
        });

        const result = checkBudget('1000000'); // 1.00 USDC (total 5.00 == 5.00)
        expect(result.allowed).toBe(true);
      });
    });

    describe('total/lifetime limit', () => {
      it('should reject when lifetime total + amount exceeds total limit', () => {
        setBudget({ totalMax: '50.00' });

        // Add old payment
        appendPayment({
          ts: '2025-01-01T00:00:00.000Z',
          url: 'https://example.com/1',
          amount: '49500000', // 49.50 USDC
          asset: 'USDC',
          network: 'eip155:324705682',
          txHash: '0xaaa',
          mode: 'client',
        });

        const result = checkBudget('1000000'); // 1.00 USDC (total 50.50 > 50.00)
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('total');
        expect(result.spent).toBe('49500000');
      });

      it('should allow when lifetime total + amount is within total limit', () => {
        setBudget({ totalMax: '50.00' });

        appendPayment({
          ts: '2025-01-01T00:00:00.000Z',
          url: 'https://example.com/1',
          amount: '10000000', // 10.00 USDC
          asset: 'USDC',
          network: 'eip155:324705682',
          txHash: '0xaaa',
          mode: 'client',
        });

        const result = checkBudget('1000000'); // 1.00 USDC (total 11.00 <= 50.00)
        expect(result.allowed).toBe(true);
      });
    });

    describe('combined limits', () => {
      it('should check all limits and reject on first failure', () => {
        setBudget({
          perRequestMax: '1.00',
          dailyMax: '5.00',
          totalMax: '50.00',
        });

        // Per-request violation (2 USDC > 1 USDC per-request)
        const result = checkBudget('2000000');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('per_request');
      });

      it('should pass all limits when within bounds', () => {
        setBudget({
          perRequestMax: '1.00',
          dailyMax: '5.00',
          totalMax: '50.00',
        });

        const result = checkBudget('500000'); // 0.50 USDC
        expect(result.allowed).toBe(true);
      });
    });
  });
});
