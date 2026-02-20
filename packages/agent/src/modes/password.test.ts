import { describe, it, expect } from 'vitest';
import { PasswordEncryptionMode, validatePasswordStrength } from './password.js';
import type { PasswordStrengthResult } from './password.js';
import { DeriveKeyError, AuthenticationError } from '../encryption-mode.js';

// -- Password Strength Validation ---

describe('validatePasswordStrength', () => {
  it('should reject passwords shorter than 8 characters', () => {
    const result = validatePasswordStrength('short');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('at least 8 characters');
  });

  it('should reject empty password', () => {
    const result = validatePasswordStrength('');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('at least 8 characters');
  });

  it('should accept password with exactly 8 characters', () => {
    const result = validatePasswordStrength('abcdefgh');
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should accept long passwords', () => {
    const result = validatePasswordStrength('a'.repeat(128));
    expect(result.valid).toBe(true);
  });

  it('should accept passwords with special characters', () => {
    const result = validatePasswordStrength('p@ssw0rd!');
    expect(result.valid).toBe(true);
  });

  it('should accept passwords with unicode characters', () => {
    const result = validatePasswordStrength('пароль12');
    expect(result.valid).toBe(true);
  });

  it('should accept passwords with spaces', () => {
    const result = validatePasswordStrength('my secret passphrase');
    expect(result.valid).toBe(true);
  });

  it('should reject 7-character password', () => {
    const result = validatePasswordStrength('1234567');
    expect(result.valid).toBe(false);
  });

  it('should return typed result object', () => {
    const result: PasswordStrengthResult = validatePasswordStrength('validpass');
    expect(result).toHaveProperty('valid');
  });
});

// -- PasswordEncryptionMode ---

describe('PasswordEncryptionMode', () => {
  const mode = new PasswordEncryptionMode();

  describe('deriveKey', () => {
    it('should derive a key from password and salt', async () => {
      const salt = new Uint8Array(32).fill(0x01);
      const key = await mode.deriveKey(salt, 'test-password-123');

      expect(key.type).toBe('secret');
    });

    it('should reject weak passwords (< 8 chars)', async () => {
      const salt = new Uint8Array(32).fill(0x01);

      await expect(mode.deriveKey(salt, 'short')).rejects.toThrow(DeriveKeyError);
      await expect(mode.deriveKey(salt, 'short')).rejects.toThrow(
        'at least 8 characters',
      );
    });

    it('should reject empty password', async () => {
      const salt = new Uint8Array(32).fill(0x01);

      await expect(mode.deriveKey(salt, '')).rejects.toThrow(DeriveKeyError);
    });

    it('should reject invalid salt size', async () => {
      const badSalt = new Uint8Array(16);

      await expect(mode.deriveKey(badSalt, 'valid-password')).rejects.toThrow(
        'salt must be exactly 32 bytes',
      );
    });

    it('should produce deterministic keys for same password+salt', async () => {
      const salt = new Uint8Array(32).fill(0x02);
      const password = 'deterministic-test';

      const key1 = await mode.deriveKey(salt, password);
      const key2 = await mode.deriveKey(salt, password);

      // Verify by encrypting with one, decrypting with other
      const plaintext = new TextEncoder().encode('test data');
      const encrypted = await mode.encrypt(plaintext, key1);
      const decrypted = await mode.decrypt(encrypted, key2);
      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different keys for different passwords', async () => {
      const salt = new Uint8Array(32).fill(0x03);

      const key1 = await mode.deriveKey(salt, 'password-one');
      const key2 = await mode.deriveKey(salt, 'password-two');

      const plaintext = new TextEncoder().encode('test');
      const encrypted = await mode.encrypt(plaintext, key1);

      await expect(mode.decrypt(encrypted, key2)).rejects.toThrow(AuthenticationError);
    });

    it('should be case-sensitive', async () => {
      const salt = new Uint8Array(32).fill(0x04);

      const keyLower = await mode.deriveKey(salt, 'my-password');
      const keyUpper = await mode.deriveKey(salt, 'My-Password');

      const plaintext = new TextEncoder().encode('test');
      const encrypted = await mode.encrypt(plaintext, keyLower);

      await expect(mode.decrypt(encrypted, keyUpper)).rejects.toThrow(AuthenticationError);
    });

    it('should reject Uint8Array input (password mode is string-only)', async () => {
      const salt = new Uint8Array(32).fill(0x05);
      const bytes = new Uint8Array(32).fill(0xAA);

      await expect(mode.deriveKey(salt, bytes)).rejects.toThrow(DeriveKeyError);
      await expect(mode.deriveKey(salt, bytes)).rejects.toThrow(
        'Password mode requires a string input',
      );
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt successfully', async () => {
      const salt = new Uint8Array(32).fill(0x06);
      const key = await mode.deriveKey(salt, 'round-trip-test');
      const plaintext = new TextEncoder().encode('secret private key data');

      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (IV variance)', async () => {
      const salt = new Uint8Array(32).fill(0x07);
      const key = await mode.deriveKey(salt, 'iv-variance-test');
      const plaintext = new TextEncoder().encode('same data');

      const encrypted1 = await mode.encrypt(plaintext, key);
      const encrypted2 = await mode.encrypt(plaintext, key);

      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    it('should reject tampered ciphertext', async () => {
      const salt = new Uint8Array(32).fill(0x08);
      const key = await mode.deriveKey(salt, 'tamper-test-pw');
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
      const salt = new Uint8Array(32).fill(0x09);
      const key = await mode.deriveKey(salt, 'tag-tamper-test');
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
      const salt = new Uint8Array(32).fill(0x0A);
      const key = await mode.deriveKey(salt, 'empty-plaintext');
      const plaintext = new Uint8Array(0);

      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('edge cases', () => {
    it('should handle password at exact minimum length (8)', async () => {
      const salt = new Uint8Array(32).fill(0x0B);
      const key = await mode.deriveKey(salt, '12345678');
      const plaintext = new TextEncoder().encode('data');

      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);
      expect(decrypted).toEqual(plaintext);
    });

    it('should handle very long password (1000 chars)', async () => {
      const salt = new Uint8Array(32).fill(0x0C);
      const longPassword = 'x'.repeat(1000);
      const key = await mode.deriveKey(salt, longPassword);
      const plaintext = new TextEncoder().encode('data');

      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);
      expect(decrypted).toEqual(plaintext);
    });

    it('should handle password with only whitespace (if >= 8 chars)', async () => {
      const salt = new Uint8Array(32).fill(0x0D);
      const key = await mode.deriveKey(salt, '        '); // 8 spaces
      expect(key.type).toBe('secret');
    });

    it('should handle password with null bytes', async () => {
      const salt = new Uint8Array(32).fill(0x0E);
      const key = await mode.deriveKey(salt, 'pass\0\0\0\0word');
      expect(key.type).toBe('secret');
    });

    it('should delegate encrypt/decrypt to KeyDerivationEngine', async () => {
      // Verify PasswordEncryptionMode reuses engine, not reimplements
      const salt = new Uint8Array(32).fill(0x0F);
      const key = await mode.deriveKey(salt, 'delegate-test');

      // If delegation works, encrypt/decrypt should function correctly
      const plaintext = new TextEncoder().encode('delegation check');
      const encrypted = await mode.encrypt(plaintext, key);
      const decrypted = await mode.decrypt(encrypted, key);
      expect(decrypted).toEqual(plaintext);
    });
  });
});
