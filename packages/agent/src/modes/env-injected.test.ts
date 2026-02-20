import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EnvInjectedEncryptionMode,
  decodeKeyMaterial,
  readKeyFromEnvironment,
} from './env-injected.js';
import { DeriveKeyError, AuthenticationError } from '../encryption-mode.js';
import * as crypto from 'node:crypto';

// -- Helpers ---

/** Generate a valid base64-encoded 32-byte key for testing. */
function generateTestKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

// -- decodeKeyMaterial ---

describe('decodeKeyMaterial', () => {
  it('should decode valid base64 to 32 bytes', () => {
    const key = crypto.randomBytes(32);
    const encoded = key.toString('base64');

    const decoded = decodeKeyMaterial(encoded);

    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.length).toBe(32);
    expect(Buffer.from(decoded)).toEqual(key);
  });

  it('should reject empty string', () => {
    expect(() => decodeKeyMaterial('')).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial('')).toThrow('is empty');
  });

  it('should reject string with whitespace', () => {
    const key = generateTestKey();
    expect(() => decodeKeyMaterial(`${key} `)).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial(`${key} `)).toThrow('whitespace');
  });

  it('should reject string with newline', () => {
    const key = generateTestKey();
    expect(() => decodeKeyMaterial(`${key}\n`)).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial(`${key}\n`)).toThrow('whitespace');
  });

  it('should reject string with tab', () => {
    const key = generateTestKey();
    expect(() => decodeKeyMaterial(`\t${key}`)).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial(`\t${key}`)).toThrow('whitespace');
  });

  it('should reject invalid base64 characters', () => {
    expect(() => decodeKeyMaterial('not-valid-base64!!!')).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial('not-valid-base64!!!')).toThrow('not valid base64');
  });

  it('should reject 16-byte key (too short)', () => {
    const shortKey = crypto.randomBytes(16).toString('base64');
    expect(() => decodeKeyMaterial(shortKey)).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial(shortKey)).toThrow('exactly 32 bytes');
    expect(() => decodeKeyMaterial(shortKey)).toThrow('got 16');
  });

  it('should reject 48-byte key (too long)', () => {
    const longKey = crypto.randomBytes(48).toString('base64');
    expect(() => decodeKeyMaterial(longKey)).toThrow(DeriveKeyError);
    expect(() => decodeKeyMaterial(longKey)).toThrow('exactly 32 bytes');
    expect(() => decodeKeyMaterial(longKey)).toThrow('got 48');
  });

  it('should include generation instructions in error messages', () => {
    try {
      decodeKeyMaterial('');
    } catch (error) {
      expect(error).toBeInstanceOf(DeriveKeyError);
      expect((error as DeriveKeyError).message).toContain('crypto.randomBytes(32)');
    }
  });

  it('should accept base64 with padding', () => {
    // 32 bytes = 44 chars base64 with padding
    const key = crypto.randomBytes(32).toString('base64');
    expect(key).toContain('='); // Most 32-byte keys end with =
    const decoded = decodeKeyMaterial(key);
    expect(decoded.length).toBe(32);
  });
});

// -- readKeyFromEnvironment ---

describe('readKeyFromEnvironment', () => {
  const originalEnv = process.env['PAPERWALL_WALLET_KEY'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['PAPERWALL_WALLET_KEY'];
    } else {
      process.env['PAPERWALL_WALLET_KEY'] = originalEnv;
    }
  });

  it('should read PAPERWALL_WALLET_KEY from environment', () => {
    const key = generateTestKey();
    process.env['PAPERWALL_WALLET_KEY'] = key;

    const result = readKeyFromEnvironment();

    expect(result).toBe(key);
  });

  it('should throw when env var is not set', () => {
    delete process.env['PAPERWALL_WALLET_KEY'];

    expect(() => readKeyFromEnvironment()).toThrow(DeriveKeyError);
    expect(() => readKeyFromEnvironment()).toThrow('PAPERWALL_WALLET_KEY is not set');
  });

  it('should throw when env var is empty string', () => {
    process.env['PAPERWALL_WALLET_KEY'] = '';

    expect(() => readKeyFromEnvironment()).toThrow(DeriveKeyError);
    expect(() => readKeyFromEnvironment()).toThrow('PAPERWALL_WALLET_KEY is not set');
  });

  it('should include generation instructions in error', () => {
    delete process.env['PAPERWALL_WALLET_KEY'];

    try {
      readKeyFromEnvironment();
    } catch (error) {
      expect(error).toBeInstanceOf(DeriveKeyError);
      expect((error as DeriveKeyError).message).toContain('crypto.randomBytes(32)');
    }
  });

  it('should not include the key value in error messages', () => {
    delete process.env['PAPERWALL_WALLET_KEY'];

    try {
      readKeyFromEnvironment();
    } catch (error) {
      // Error should mention the var name, not any key value
      const msg = (error as DeriveKeyError).message;
      expect(msg).toContain('PAPERWALL_WALLET_KEY');
      expect(msg).not.toMatch(/[A-Za-z0-9+/]{40,}/); // No long base64 strings
    }
  });
});

// -- EnvInjectedEncryptionMode ---

describe('EnvInjectedEncryptionMode', () => {
  const originalEnv = process.env['PAPERWALL_WALLET_KEY'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['PAPERWALL_WALLET_KEY'];
    } else {
      process.env['PAPERWALL_WALLET_KEY'] = originalEnv;
    }
  });

  describe('deriveKey', () => {
    it('should derive a key from env var', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x01);

      const key = await mode.deriveKey(salt, new Uint8Array(0));

      expect(key.type).toBe('secret');
    });

    it('should throw when env var is missing', async () => {
      delete process.env['PAPERWALL_WALLET_KEY'];
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x01);

      await expect(mode.deriveKey(salt, new Uint8Array(0))).rejects.toThrow(DeriveKeyError);
    });

    it('should throw when env var has invalid base64', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = '!!!invalid!!!';
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x01);

      await expect(mode.deriveKey(salt, new Uint8Array(0))).rejects.toThrow(DeriveKeyError);
    });

    it('should throw when decoded key is wrong length', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = crypto.randomBytes(16).toString('base64');
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x01);

      await expect(mode.deriveKey(salt, new Uint8Array(0))).rejects.toThrow('exactly 32 bytes');
    });

    it('should produce deterministic keys for same env+salt', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x02);

      const key1 = await mode.deriveKey(salt, new Uint8Array(0));
      const key2 = await mode.deriveKey(salt, new Uint8Array(0));

      const plaintext = new TextEncoder().encode('test');
      const encrypted = await mode.encrypt(plaintext, key1);
      const decrypted = await mode.decrypt(encrypted, key2);
      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different keys for different env values', async () => {
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x03);

      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const key1 = await mode.deriveKey(salt, new Uint8Array(0));

      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const key2 = await mode.deriveKey(salt, new Uint8Array(0));

      const plaintext = new TextEncoder().encode('test');
      const encrypted = await mode.encrypt(plaintext, key1);

      await expect(mode.decrypt(encrypted, key2)).rejects.toThrow(AuthenticationError);
    });

    it('should produce different keys for different salts', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();

      const salt1 = new Uint8Array(32).fill(0x04);
      const salt2 = new Uint8Array(32).fill(0x05);

      const key1 = await mode.deriveKey(salt1, new Uint8Array(0));
      const key2 = await mode.deriveKey(salt2, new Uint8Array(0));

      const plaintext = new TextEncoder().encode('test');
      const encrypted = await mode.encrypt(plaintext, key1);

      await expect(mode.decrypt(encrypted, key2)).rejects.toThrow(AuthenticationError);
    });

    it('should ignore the input parameter', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x06);

      // Both string and Uint8Array inputs should produce the same key
      const key1 = await mode.deriveKey(salt, 'ignored-string');
      const key2 = await mode.deriveKey(salt, new Uint8Array(0));

      const plaintext = new TextEncoder().encode('test');
      const encrypted = await mode.encrypt(plaintext, key1);
      const decrypted = await mode.decrypt(encrypted, key2);
      expect(decrypted).toEqual(plaintext);
    });

    it('should reject invalid salt size', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const badSalt = new Uint8Array(16);

      await expect(mode.deriveKey(badSalt, new Uint8Array(0))).rejects.toThrow(
        'salt must be exactly 32 bytes',
      );
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt successfully', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x07);
      const key = await mode.deriveKey(salt, new Uint8Array(0));
      const plaintext = new TextEncoder().encode('secret private key data');

      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (IV variance)', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x08);
      const key = await mode.deriveKey(salt, new Uint8Array(0));
      const plaintext = new TextEncoder().encode('same data');

      const encrypted1 = await mode.encrypt(plaintext, key);
      const encrypted2 = await mode.encrypt(plaintext, key);

      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    it('should reject tampered ciphertext', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x09);
      const key = await mode.deriveKey(salt, new Uint8Array(0));
      const plaintext = new TextEncoder().encode('do not tamper');

      const encrypted = await mode.encrypt(plaintext, key);
      const tampered = {
        ...encrypted,
        ciphertext: new Uint8Array(encrypted.ciphertext),
      };
      tampered.ciphertext[0] ^= 0xFF;

      await expect(mode.decrypt(tampered, key)).rejects.toThrow(AuthenticationError);
    });

    it('should reject tampered auth tag', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x0A);
      const key = await mode.deriveKey(salt, new Uint8Array(0));
      const plaintext = new TextEncoder().encode('protect me');

      const encrypted = await mode.encrypt(plaintext, key);
      const tampered = {
        ...encrypted,
        authTag: new Uint8Array(encrypted.authTag),
      };
      tampered.authTag[0] ^= 0xFF;

      await expect(mode.decrypt(tampered, key)).rejects.toThrow(AuthenticationError);
    });

    it('should handle empty plaintext', async () => {
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const mode = new EnvInjectedEncryptionMode();
      const salt = new Uint8Array(32).fill(0x0B);
      const key = await mode.deriveKey(salt, new Uint8Array(0));
      const plaintext = new Uint8Array(0);

      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('integration with PasswordEncryptionMode', () => {
    it('should not be interchangeable with password mode (different key material)', async () => {
      // Env-injected uses raw bytes; password uses string. Even if the base64
      // string is 8+ chars, the derived keys should differ because the input
      // to PBKDF2 is different (raw bytes vs UTF-8 encoded string).
      process.env['PAPERWALL_WALLET_KEY'] = generateTestKey();
      const { PasswordEncryptionMode } = await import('./password.js');

      const envMode = new EnvInjectedEncryptionMode();
      const pwMode = new PasswordEncryptionMode();
      const salt = new Uint8Array(32).fill(0x0C);

      const envKey = await envMode.deriveKey(salt, new Uint8Array(0));

      // Use the same base64 string as a "password" (>= 8 chars)
      const envValue = process.env['PAPERWALL_WALLET_KEY'] as string;
      const pwKey = await pwMode.deriveKey(salt, envValue);

      const plaintext = new TextEncoder().encode('cross-mode test');
      const encrypted = await envMode.encrypt(plaintext, envKey);

      // Should fail because keys are derived from different input
      await expect(envMode.decrypt(encrypted, pwKey)).rejects.toThrow(AuthenticationError);
    });
  });
});
