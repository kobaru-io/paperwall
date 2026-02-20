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
  it('should define EncryptionKey type with required fields', () => {
    const key: EncryptionKey = {
      type: 'secret',
      extractable: false,
      algorithm: { name: 'AES-GCM' },
      usages: ['encrypt', 'decrypt'],
    };
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.extractable).toBe(false);
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
