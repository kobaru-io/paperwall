import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import { generatePrivateKey, encryptKey, decryptKey, getMachineIdentity } from './crypto.js';

// Store real values for restore
const realHostname = os.hostname();

describe('crypto', () => {
  describe('generatePrivateKey', () => {
    it('should return a 64-character hex string', () => {
      const key = generatePrivateKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate different keys each time', () => {
      const key1 = generatePrivateKey();
      const key2 = generatePrivateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('getMachineIdentity', () => {
    it('should include hostname and uid', () => {
      const identity = getMachineIdentity();
      expect(identity).toContain(os.hostname());
      expect(identity).toContain(String(os.userInfo().uid));
      expect(identity).toContain('paperwall-agent-machine-bound-v1');
    });
  });

  describe('encryptKey / decryptKey', () => {
    it('should encrypt and decrypt round-trip', async () => {
      const privateKey = generatePrivateKey();

      const encrypted = await encryptKey(privateKey);
      expect(encrypted.encryptedKey).toBeDefined();
      expect(encrypted.keySalt).toBeDefined();
      expect(encrypted.keyIv).toBeDefined();

      const decrypted = await decryptKey(
        encrypted.encryptedKey,
        encrypted.keySalt,
        encrypted.keyIv,
      );
      expect(decrypted).toBe(privateKey);
    });

    it('should fail to decrypt with tampered salt (simulates different machine)', async () => {
      const privateKey = generatePrivateKey();
      const encrypted = await encryptKey(privateKey);

      // Tamper with salt to simulate a different derivation input
      const tamperedSalt = 'ff'.repeat(32);

      await expect(
        decryptKey(
          encrypted.encryptedKey,
          tamperedSalt,
          encrypted.keyIv,
        ),
      ).rejects.toThrow();
    });

    it('should produce different outputs with different salts', async () => {
      const privateKey = generatePrivateKey();

      const encrypted1 = await encryptKey(privateKey);
      const encrypted2 = await encryptKey(privateKey);

      expect(encrypted1.keySalt).not.toBe(encrypted2.keySalt);
      expect(encrypted1.encryptedKey).not.toBe(encrypted2.encryptedKey);
    });

    it('should produce hex strings for all output fields', async () => {
      const privateKey = generatePrivateKey();
      const encrypted = await encryptKey(privateKey);

      expect(encrypted.encryptedKey).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.keySalt).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
      expect(encrypted.keyIv).toMatch(/^[0-9a-f]{24}$/);   // 12 bytes = 24 hex chars
    });
  });
});
