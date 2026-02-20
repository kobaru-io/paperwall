import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionPasswordCache } from './session-cache.js';
import type { PasswordPromptFn } from './session-cache.js';

// -- Tests ---

describe('SessionPasswordCache', () => {
  let cache: SessionPasswordCache;

  beforeEach(() => {
    cache = new SessionPasswordCache();
  });

  afterEach(() => {
    cache.clear();
  });

  // -- getOrPrompt ---

  describe('getOrPrompt', () => {
    it('should call promptFn when address is not cached', async () => {
      const promptFn: PasswordPromptFn = vi.fn().mockResolvedValue('secret123');

      const result = await cache.getOrPrompt('0xABC', promptFn);

      expect(result).toBe('secret123');
      expect(promptFn).toHaveBeenCalledWith('0xABC');
    });

    it('should return cached password without calling promptFn', async () => {
      const promptFn: PasswordPromptFn = vi.fn().mockResolvedValue('first-call');

      await cache.getOrPrompt('0xABC', promptFn);

      const secondPromptFn: PasswordPromptFn = vi.fn().mockResolvedValue('second-call');
      const result = await cache.getOrPrompt('0xABC', secondPromptFn);

      expect(result).toBe('first-call');
      expect(secondPromptFn).not.toHaveBeenCalled();
    });

    it('should normalize addresses to lowercase for cache lookup', async () => {
      const promptFn: PasswordPromptFn = vi.fn().mockResolvedValue('password');

      await cache.getOrPrompt('0xABCDEF', promptFn);

      const secondPromptFn: PasswordPromptFn = vi.fn();
      const result = await cache.getOrPrompt('0xabcdef', secondPromptFn);

      expect(result).toBe('password');
      expect(secondPromptFn).not.toHaveBeenCalled();
    });

    it('should cache different passwords for different addresses', async () => {
      const promptFn1: PasswordPromptFn = vi.fn().mockResolvedValue('pass-1');
      const promptFn2: PasswordPromptFn = vi.fn().mockResolvedValue('pass-2');

      await cache.getOrPrompt('0x111', promptFn1);
      await cache.getOrPrompt('0x222', promptFn2);

      const noopFn: PasswordPromptFn = vi.fn();
      expect(await cache.getOrPrompt('0x111', noopFn)).toBe('pass-1');
      expect(await cache.getOrPrompt('0x222', noopFn)).toBe('pass-2');
      expect(noopFn).not.toHaveBeenCalled();
    });

    it('should propagate errors from promptFn', async () => {
      const promptFn: PasswordPromptFn = vi.fn().mockRejectedValue(new Error('prompt failed'));

      await expect(cache.getOrPrompt('0xABC', promptFn)).rejects.toThrow('prompt failed');
      expect(cache.has('0xABC')).toBe(false);
    });
  });

  // -- has ---

  describe('has', () => {
    it('should return false for uncached address', () => {
      expect(cache.has('0xABC')).toBe(false);
    });

    it('should return true for cached address', async () => {
      await cache.getOrPrompt('0xABC', async () => 'pass');
      expect(cache.has('0xABC')).toBe(true);
    });

    it('should be case-insensitive', async () => {
      await cache.getOrPrompt('0xABC', async () => 'pass');
      expect(cache.has('0xabc')).toBe(true);
    });
  });

  // -- size ---

  describe('size', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size).toBe(0);
    });

    it('should reflect number of cached entries', async () => {
      await cache.getOrPrompt('0x1', async () => 'a');
      await cache.getOrPrompt('0x2', async () => 'b');
      expect(cache.size).toBe(2);
    });
  });

  // -- clear ---

  describe('clear', () => {
    it('should remove all entries', async () => {
      await cache.getOrPrompt('0x1', async () => 'a');
      await cache.getOrPrompt('0x2', async () => 'b');

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has('0x1')).toBe(false);
    });

    it('should be safe to call on empty cache', () => {
      expect(() => cache.clear()).not.toThrow();
    });
  });

  // -- remove ---

  describe('remove', () => {
    it('should remove a single cached entry', async () => {
      await cache.getOrPrompt('0x1', async () => 'a');
      await cache.getOrPrompt('0x2', async () => 'b');

      const removed = cache.remove('0x1');

      expect(removed).toBe(true);
      expect(cache.has('0x1')).toBe(false);
      expect(cache.has('0x2')).toBe(true);
    });

    it('should return false for non-existent address', () => {
      expect(cache.remove('0xNOPE')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      await cache.getOrPrompt('0xABC', async () => 'pass');
      expect(cache.remove('0xabc')).toBe(true);
      expect(cache.has('0xABC')).toBe(false);
    });
  });

  // -- registerExitHandler ---

  describe('registerExitHandler', () => {
    it('should register process exit handlers', () => {
      const onSpy = vi.spyOn(process, 'on');

      cache.registerExitHandler();

      expect(onSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      onSpy.mockRestore();
    });

    it('should be idempotent (only registers once)', () => {
      const onSpy = vi.spyOn(process, 'on');

      cache.registerExitHandler();
      cache.registerExitHandler();
      cache.registerExitHandler();

      const exitCalls = onSpy.mock.calls.filter((c) => c[0] === 'exit');
      expect(exitCalls).toHaveLength(1);

      onSpy.mockRestore();
    });
  });
});
