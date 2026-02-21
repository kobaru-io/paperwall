import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyCache } from './key-cache.js';

describe('KeyCache', () => {
  let cache: KeyCache;

  beforeEach(() => {
    cache = new KeyCache();
  });

  it('should call resolver on first access and return result', async () => {
    const resolver = vi.fn().mockResolvedValue('0x' + 'a'.repeat(64));
    const result = await cache.getOrResolve(resolver);
    expect(result).toBe('0x' + 'a'.repeat(64));
    expect(resolver).toHaveBeenCalledOnce();
  });

  it('should return cached value on second access without calling resolver again', async () => {
    const resolver = vi.fn().mockResolvedValue('0x' + 'b'.repeat(64));
    await cache.getOrResolve(resolver);
    const result = await cache.getOrResolve(resolver);
    expect(result).toBe('0x' + 'b'.repeat(64));
    expect(resolver).toHaveBeenCalledOnce();
  });

  it('should resolve again after clear()', async () => {
    const key1 = '0x' + 'c'.repeat(64) as `0x${string}`;
    const key2 = '0x' + 'd'.repeat(64) as `0x${string}`;
    const resolver = vi.fn()
      .mockResolvedValueOnce(key1)
      .mockResolvedValueOnce(key2);

    const first = await cache.getOrResolve(resolver);
    expect(first).toBe(key1);

    cache.clear();

    const second = await cache.getOrResolve(resolver);
    expect(second).toBe(key2);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('should not cache errors and allow retry after failure', async () => {
    const key = '0x' + 'e'.repeat(64) as `0x${string}`;
    const resolver = vi.fn()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce(key);

    await expect(cache.getOrResolve(resolver)).rejects.toThrow('transient failure');

    const result = await cache.getOrResolve(resolver);
    expect(result).toBe(key);
    expect(resolver).toHaveBeenCalledTimes(2);
  });
});
