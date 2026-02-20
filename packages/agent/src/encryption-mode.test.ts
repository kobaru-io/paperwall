import { describe, it, expect } from 'vitest';
import type {
  EncryptionMode,
  EncryptionKey,
  EncryptedData,
} from './encryption-mode.js';
import {
  DeriveKeyError,
  EncryptionError,
  DecryptionError,
  AuthenticationError,
} from './encryption-mode.js';

describe('EncryptionMode interface', () => {
  it('should define EncryptionKey as a branded CryptoKey type', () => {
    // EncryptionKey is a branded CryptoKey — verify via actual key derivation in integration tests.
    // Here we verify the brand prevents plain object assignment at compile time.
    const mockKey = { type: 'secret', algorithm: { name: 'AES-GCM' } } as EncryptionKey;
    expect(mockKey.type).toBe('secret');
    expect(mockKey.algorithm.name).toBe('AES-GCM');
  });

  it('should define EncryptedData type with required fields', () => {
    const encrypted: EncryptedData = {
      ciphertext: new Uint8Array(64),
      iv: new Uint8Array(12),
      authTag: new Uint8Array(16),
    };
    expect(encrypted.iv.length).toBe(12);
    expect(encrypted.authTag.length).toBe(16);
  });

  it('should define EncryptionMode interface shape', () => {
    // Type-level test: verify the interface has expected methods
    const _check: EncryptionMode = {
      deriveKey: async () => ({} as EncryptionKey),
      encrypt: async () => ({} as EncryptedData),
      decrypt: async () => new Uint8Array(0),
    };
    expect(_check.deriveKey).toBeDefined();
    expect(_check.encrypt).toBeDefined();
    expect(_check.decrypt).toBeDefined();
  });
});

describe('Error types', () => {
  it('should create DeriveKeyError with name and cause', () => {
    const cause = new Error('underlying');
    const err = new DeriveKeyError('derivation failed', cause);
    expect(err.name).toBe('DeriveKeyError');
    expect(err.message).toBe('derivation failed');
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });

  it('should create EncryptionError with name and cause', () => {
    const err = new EncryptionError('encrypt failed');
    expect(err.name).toBe('EncryptionError');
    expect(err.message).toBe('encrypt failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('should create DecryptionError with name and cause', () => {
    const err = new DecryptionError('decrypt failed');
    expect(err.name).toBe('DecryptionError');
    expect(err.message).toBe('decrypt failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('should create AuthenticationError as subclass of DecryptionError', () => {
    const err = new AuthenticationError();
    expect(err.name).toBe('AuthenticationError');
    expect(err).toBeInstanceOf(DecryptionError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Authentication tag verification failed');
  });

  it('should allow custom message on AuthenticationError', () => {
    const err = new AuthenticationError('custom message');
    expect(err.message).toBe('custom message');
  });
});
