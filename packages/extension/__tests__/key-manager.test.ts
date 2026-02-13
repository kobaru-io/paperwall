import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  generateKeyPair,
  encryptKey,
  decryptKey,
} from '../src/background/key-manager.js';

describe('key-manager', () => {
  describe('generateKeyPair', () => {
    it('returns an object with privateKey and address', () => {
      const kp = generateKeyPair();
      expect(kp).toHaveProperty('privateKey');
      expect(kp).toHaveProperty('address');
    });

    it('privateKey is 66 chars (0x + 64 hex)', () => {
      const { privateKey } = generateKeyPair();
      expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/);
      expect(privateKey).toHaveLength(66);
    });

    it('address is 42 chars (0x + 40 hex) and checksummed', () => {
      const { address } = generateKeyPair();
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(address).toHaveLength(42);
      // Checksummed addresses contain at least one uppercase letter
      // (unless all hex digits happen to be 0-9, which is astronomically unlikely)
      expect(address.slice(2)).not.toBe(address.slice(2).toLowerCase());
    });

    it('two calls produce different keys', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
      expect(kp1.address).not.toBe(kp2.address);
    });

    it('address derives correctly from private key', () => {
      const { privateKey, address } = generateKeyPair();
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      expect(account.address).toBe(address);
    });
  });

  describe('encryptKey / decryptKey', () => {
    it('encryptKey returns encryptedKey, keySalt, keyIv', async () => {
      const { privateKey } = generateKeyPair();
      const result = await encryptKey('test-password', privateKey);
      expect(result).toHaveProperty('encryptedKey');
      expect(result).toHaveProperty('keySalt');
      expect(result).toHaveProperty('keyIv');
      expect(typeof result.encryptedKey).toBe('string');
      expect(typeof result.keySalt).toBe('string');
      expect(typeof result.keyIv).toBe('string');
    });

    it('decryptKey returns original privateKey', async () => {
      const { privateKey } = generateKeyPair();
      const password = 'secure-password-123';
      const encrypted = await encryptKey(password, privateKey);
      const decrypted = await decryptKey(
        password,
        encrypted.encryptedKey,
        encrypted.keySalt,
        encrypted.keyIv,
      );
      expect(decrypted).toBe(privateKey);
    });

    it('wrong password throws error', async () => {
      const { privateKey } = generateKeyPair();
      const encrypted = await encryptKey('correct-password', privateKey);
      await expect(
        decryptKey(
          'wrong-password',
          encrypted.encryptedKey,
          encrypted.keySalt,
          encrypted.keyIv,
        ),
      ).rejects.toThrow();
    });

    it('salt is random (two encryptions produce different salts)', async () => {
      const { privateKey } = generateKeyPair();
      const password = 'same-password';
      const enc1 = await encryptKey(password, privateKey);
      const enc2 = await encryptKey(password, privateKey);
      expect(enc1.keySalt).not.toBe(enc2.keySalt);
    });

    it('IV is random (two encryptions produce different IVs)', async () => {
      const { privateKey } = generateKeyPair();
      const password = 'same-password';
      const enc1 = await encryptKey(password, privateKey);
      const enc2 = await encryptKey(password, privateKey);
      expect(enc1.keyIv).not.toBe(enc2.keyIv);
    });

    it('keySalt is 64 hex chars (32 bytes)', async () => {
      const { privateKey } = generateKeyPair();
      const encrypted = await encryptKey('password', privateKey);
      expect(encrypted.keySalt).toMatch(/^[0-9a-f]{64}$/);
    });

    it('keyIv is 24 hex chars (12 bytes)', async () => {
      const { privateKey } = generateKeyPair();
      const encrypted = await encryptKey('password', privateKey);
      expect(encrypted.keyIv).toMatch(/^[0-9a-f]{24}$/);
    });
  });
});
