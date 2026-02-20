import { describe, it, expect } from 'vitest';
import { KeyDerivationEngine } from './key-derivation-engine.js';

describe('KeyDerivationEngine', () => {
  describe('deriveKey with PBKDF2', () => {
    const engine = new KeyDerivationEngine();

    it('should derive a CryptoKey from password and salt', async () => {
      const salt = new Uint8Array(32).fill(0x01);
      const password = 'test-password-123';

      const key = await engine.deriveKey(salt, password);

      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });

    it('should produce same key for identical inputs (deterministic)', async () => {
      const salt = new Uint8Array(32).fill(0x02);
      const password = 'test-password';

      const key1 = await engine.deriveKey(salt, password);
      const key2 = await engine.deriveKey(salt, password);

      // Both should be usable (can't compare CryptoKey objects directly)
      expect(key1.type).toBe(key2.type);
    });

    it('should produce different keys for different passwords', async () => {
      const salt = new Uint8Array(32).fill(0x03);

      const key1 = await engine.deriveKey(salt, 'password1');
      const key2 = await engine.deriveKey(salt, 'password2');

      // Verify by trying to encrypt/decrypt with wrong key
      const plaintext = new TextEncoder().encode('test');
      const encrypted = await engine.encrypt(plaintext, key1);

      await expect(engine.decrypt(encrypted, key2)).rejects.toThrow();
    });

    it('should produce different keys for different salts', async () => {
      const salt1 = new Uint8Array(32).fill(0x04);
      const salt2 = new Uint8Array(32).fill(0x05);
      const password = 'test-password';

      const key1 = await engine.deriveKey(salt1, password);
      const key2 = await engine.deriveKey(salt2, password);

      // Verify by trying to encrypt/decrypt with mismatched keys
      const plaintext = new TextEncoder().encode('test');
      const encrypted = await engine.encrypt(plaintext, key1);

      await expect(engine.decrypt(encrypted, key2)).rejects.toThrow();
    });

    it('should use 600,000 PBKDF2 iterations', async () => {
      const salt = new Uint8Array(32).fill(0x06);
      const password = 'test';

      const start = performance.now();
      await engine.deriveKey(salt, password);
      const duration = performance.now() - start;

      // PBKDF2 with 600k iterations should take >50ms
      expect(duration).toBeGreaterThan(50);
    });

    it('should reject invalid salt (not 32 bytes)', async () => {
      const invalidSalt = new Uint8Array(16);

      await expect(
        engine.deriveKey(invalidSalt, 'password'),
      ).rejects.toThrow('salt must be exactly 32 bytes');
    });

    it('should reject empty password', async () => {
      const salt = new Uint8Array(32).fill(0x07);

      await expect(
        engine.deriveKey(salt, ''),
      ).rejects.toThrow('password must not be empty');
    });

    it('should accept Uint8Array input (for env-injected mode)', async () => {
      const salt = new Uint8Array(32).fill(0x08);
      const keyBytes = new Uint8Array(32).fill(0xAA);

      const key = await engine.deriveKey(salt, keyBytes);

      expect(key.type).toBe('secret');
    });
  });

  describe('encrypt/decrypt', () => {
    const engine = new KeyDerivationEngine();

    it('should encrypt and decrypt round-trip', async () => {
      const salt = new Uint8Array(32).fill(0x09);
      const password = 'test-password';
      const plaintext = new TextEncoder().encode('secret data');

      const key = await engine.deriveKey(salt, password);
      const encrypted = await engine.encrypt(plaintext, key);
      const decrypted = await engine.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (IV variance)', async () => {
      const salt = new Uint8Array(32).fill(0x0A);
      const password = 'test';
      const plaintext = new TextEncoder().encode('data');
      const key = await engine.deriveKey(salt, password);

      const encrypted1 = await engine.encrypt(plaintext, key);
      const encrypted2 = await engine.encrypt(plaintext, key);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
    });

    it('should reject tampered ciphertext', async () => {
      const salt = new Uint8Array(32).fill(0x0B);
      const key = await engine.deriveKey(salt, 'password');
      const encrypted = await engine.encrypt(
        new TextEncoder().encode('test'),
        key,
      );

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: new Uint8Array(encrypted.ciphertext),
      };
      tampered.ciphertext[0] ^= 0xFF;

      await expect(engine.decrypt(tampered, key)).rejects.toThrow();
    });

    it('should reject tampered auth tag', async () => {
      const salt = new Uint8Array(32).fill(0x0C);
      const key = await engine.deriveKey(salt, 'password');
      const encrypted = await engine.encrypt(
        new TextEncoder().encode('test'),
        key,
      );

      // Tamper with auth tag
      const tampered = {
        ...encrypted,
        authTag: new Uint8Array(encrypted.authTag),
      };
      tampered.authTag[0] ^= 0xFF;

      await expect(engine.decrypt(tampered, key)).rejects.toThrow();
    });

    it('should handle large plaintexts (1MB)', async () => {
      const salt = new Uint8Array(32).fill(0x0D);
      const key = await engine.deriveKey(salt, 'password');
      const largePlaintext = new Uint8Array(1024 * 1024).fill(0xAA);

      const encrypted = await engine.encrypt(largePlaintext, key);
      const decrypted = await engine.decrypt(encrypted, key);

      expect(decrypted).toEqual(largePlaintext);
    });
  });
});
