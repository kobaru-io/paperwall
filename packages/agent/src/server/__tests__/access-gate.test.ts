import { describe, it, expect } from 'vitest';
import { checkAccess, parseAccessKeys } from '../access-gate.js';

describe('checkAccess', () => {
  it('allows all when no keys configured', () => {
    const result = checkAccess([], undefined);
    expect(result.allowed).toBe(true);
  });

  it('allows valid key', () => {
    const result = checkAccess(['key-1', 'key-2'], 'key-1');
    expect(result.allowed).toBe(true);
  });

  it('denies invalid key', () => {
    const result = checkAccess(['key-1'], 'wrong-key');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_key');
  });

  it('denies missing key when keys are configured', () => {
    const result = checkAccess(['key-1'], undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('missing_key');
  });

  it('allows empty string key list (open access)', () => {
    const result = checkAccess([], 'any-key');
    expect(result.allowed).toBe(true);
  });
});

describe('parseAccessKeys', () => {
  it('returns empty for undefined', () => {
    expect(parseAccessKeys(undefined)).toEqual([]);
  });

  it('returns empty for empty string', () => {
    expect(parseAccessKeys('')).toEqual([]);
  });

  it('parses single key', () => {
    expect(parseAccessKeys('key1')).toEqual(['key1']);
  });

  it('parses multiple keys with trimming', () => {
    expect(parseAccessKeys('key1, key2 , key3')).toEqual([
      'key1',
      'key2',
      'key3',
    ]);
  });

  it('filters empty entries', () => {
    expect(parseAccessKeys('key1,,key2')).toEqual(['key1', 'key2']);
  });
});
