import { describe, it, expect } from 'vitest';
import { wipeBuffer, wipeString } from './key-wipe.js';

describe('Key Wipe Utilities', () => {
  it('should overwrite buffer with zeros', () => {
    const buffer = Buffer.from('sensitive-data');

    wipeBuffer(buffer);

    // After wipe, all bytes should be zero
    expect(buffer.every(byte => byte === 0)).toBe(true);
  });

  it('should wipe Uint8Array', () => {
    const buffer = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);

    wipeBuffer(buffer);

    expect(buffer.every(byte => byte === 0)).toBe(true);
  });

  it('should not throw on empty buffer', () => {
    const buffer = new Uint8Array(0);
    expect(() => wipeBuffer(buffer)).not.toThrow();
  });

  it('should wipe string by creating and clearing buffer copy', () => {
    // wipeString is best-effort due to JS string immutability
    expect(() => wipeString('sensitive-string')).not.toThrow();
  });
});
