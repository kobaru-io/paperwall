import * as crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EncryptionMode } from '../encryption-mode.js';
import { AuthenticationError } from '../encryption-mode.js';
import { MachineBindingMode, getMachineIdentity } from './machine-binding.js';
import { PasswordEncryptionMode } from './password.js';
import { EnvInjectedEncryptionMode } from './env-injected.js';
import { EncryptionModeDetector, UnknownEncryptionModeError } from './detector.js';
import type { EncryptionModeName, WalletMetadata } from './detector.js';
import { encryptKey, decryptKey, getMachineIdentity as legacyGetMachineIdentity } from '../crypto.js';

// -- Helpers ---

const TEST_PRIVATE_KEY = 'ab'.repeat(32); // 64 hex chars
const TEST_PASSWORD = 'my-secure-password-123';
const TEST_ENV_KEY = crypto.randomBytes(32).toString('base64');

function makeSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function roundTrip(
  mode: EncryptionMode,
  salt: Uint8Array,
  input: string | Uint8Array,
  plaintext: string,
): Promise<string> {
  const key = await mode.deriveKey(salt, input);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await mode.encrypt(encoded, key);
  const decrypted = await mode.decrypt(encrypted, key);
  return new TextDecoder().decode(decrypted);
}

// -- Integration Tests ---

describe('Encryption Modes Integration', () => {
  const detector = new EncryptionModeDetector();

  // -- All 3 modes round-trip ---

  describe('round-trip across all modes', () => {
    it('machine-bound: encrypt and decrypt private key', async () => {
      const mode = new MachineBindingMode();
      const result = await roundTrip(mode, makeSalt(), 'ignored', TEST_PRIVATE_KEY);
      expect(result).toBe(TEST_PRIVATE_KEY);
    });

    it('password: encrypt and decrypt private key', async () => {
      const mode = new PasswordEncryptionMode();
      const result = await roundTrip(mode, makeSalt(), TEST_PASSWORD, TEST_PRIVATE_KEY);
      expect(result).toBe(TEST_PRIVATE_KEY);
    });

    it('env-injected: encrypt and decrypt private key', async () => {
      const original = process.env['PAPERWALL_WALLET_KEY'];
      process.env['PAPERWALL_WALLET_KEY'] = TEST_ENV_KEY;
      try {
        const mode = new EnvInjectedEncryptionMode();
        const result = await roundTrip(mode, makeSalt(), new Uint8Array(0), TEST_PRIVATE_KEY);
        expect(result).toBe(TEST_PRIVATE_KEY);
      } finally {
        if (original === undefined) {
          delete process.env['PAPERWALL_WALLET_KEY'];
        } else {
          process.env['PAPERWALL_WALLET_KEY'] = original;
        }
      }
    });
  });

  // -- Cross-mode isolation ---

  describe('cross-mode isolation', () => {
    it('key derived by password mode cannot decrypt machine-bound ciphertext', async () => {
      const salt = makeSalt();
      const machine = new MachineBindingMode();
      const password = new PasswordEncryptionMode();

      const machineKey = await machine.deriveKey(salt, 'ignored');
      const passwordKey = await password.deriveKey(salt, TEST_PASSWORD);

      const plaintext = new TextEncoder().encode(TEST_PRIVATE_KEY);
      const encrypted = await machine.encrypt(plaintext, machineKey);

      await expect(machine.decrypt(encrypted, passwordKey)).rejects.toThrow(
        AuthenticationError,
      );
    });

    it('each mode produces distinct keys for same salt', async () => {
      const salt = makeSalt();
      const original = process.env['PAPERWALL_WALLET_KEY'];
      process.env['PAPERWALL_WALLET_KEY'] = TEST_ENV_KEY;

      try {
        const machine = new MachineBindingMode();
        const password = new PasswordEncryptionMode();
        const envMode = new EnvInjectedEncryptionMode();

        const machineKey = await machine.deriveKey(salt, 'ignored');
        const passwordKey = await password.deriveKey(salt, TEST_PASSWORD);
        const envKey = await envMode.deriveKey(salt, new Uint8Array(0));

        // Verify they are different by cross-decrypt failure
        const plaintext = new TextEncoder().encode('test');
        const encrypted = await machine.encrypt(plaintext, machineKey);

        await expect(machine.decrypt(encrypted, passwordKey)).rejects.toThrow();
        await expect(machine.decrypt(encrypted, envKey)).rejects.toThrow();
      } finally {
        if (original === undefined) {
          delete process.env['PAPERWALL_WALLET_KEY'];
        } else {
          process.env['PAPERWALL_WALLET_KEY'] = original;
        }
      }
    });
  });

  // -- Detector integration ---

  describe('detector integration', () => {
    it('should resolve and use machine-bound mode from legacy wallet metadata', async () => {
      const metadata: WalletMetadata = {}; // no encryptionMode = legacy
      const mode = detector.detectAndResolve(metadata);
      expect(mode).toBeInstanceOf(MachineBindingMode);

      const result = await roundTrip(mode, makeSalt(), 'ignored', TEST_PRIVATE_KEY);
      expect(result).toBe(TEST_PRIVATE_KEY);
    });

    it('should resolve and use password mode from metadata', async () => {
      const metadata: WalletMetadata = { encryptionMode: 'password' };
      const mode = detector.detectAndResolve(metadata);
      expect(mode).toBeInstanceOf(PasswordEncryptionMode);

      const result = await roundTrip(mode, makeSalt(), TEST_PASSWORD, TEST_PRIVATE_KEY);
      expect(result).toBe(TEST_PRIVATE_KEY);
    });

    it('should resolve and use env-injected mode from metadata', async () => {
      const original = process.env['PAPERWALL_WALLET_KEY'];
      process.env['PAPERWALL_WALLET_KEY'] = TEST_ENV_KEY;
      try {
        const metadata: WalletMetadata = { encryptionMode: 'env-injected' };
        const mode = detector.detectAndResolve(metadata);
        expect(mode).toBeInstanceOf(EnvInjectedEncryptionMode);

        const result = await roundTrip(mode, makeSalt(), new Uint8Array(0), TEST_PRIVATE_KEY);
        expect(result).toBe(TEST_PRIVATE_KEY);
      } finally {
        if (original === undefined) {
          delete process.env['PAPERWALL_WALLET_KEY'];
        } else {
          process.env['PAPERWALL_WALLET_KEY'] = original;
        }
      }
    });

    it('should throw for corrupted metadata with unknown mode', () => {
      const metadata = { encryptionMode: 'rsa-2048' } as unknown as WalletMetadata;
      expect(() => detector.detectAndResolve(metadata)).toThrow(UnknownEncryptionModeError);
    });
  });

  // -- Legacy backward compatibility ---

  describe('legacy backward compatibility', () => {
    it('MachineBindingMode produces same keys as existing crypto.ts getMachineIdentity', () => {
      // Both should use same identity string
      expect(getMachineIdentity()).toBe(legacyGetMachineIdentity());
    });

    it('existing encryptKey/decryptKey still works (regression check)', async () => {
      const rawKey = 'cd'.repeat(32);
      const encrypted = await encryptKey(rawKey);
      const decrypted = await decryptKey(
        encrypted.encryptedKey,
        encrypted.keySalt,
        encrypted.keyIv,
      );
      expect(decrypted).toBe(rawKey);
    });

    it('MachineBindingMode can decrypt data encrypted by existing crypto.ts', async () => {
      // Encrypt using legacy crypto.ts
      const rawKey = 'ef'.repeat(32);
      const encrypted = await encryptKey(rawKey);

      // Decrypt using MachineBindingMode (same machine identity + PBKDF2)
      const mode = new MachineBindingMode();
      const salt = new Uint8Array(Buffer.from(encrypted.keySalt, 'hex'));
      const key = await mode.deriveKey(salt, 'ignored');

      // Parse legacy format: combined ciphertext+authTag, separate IV
      const encryptedData = Buffer.from(encrypted.encryptedKey, 'hex');
      const AUTH_TAG_LENGTH = 16;
      const ciphertext = new Uint8Array(encryptedData.slice(0, encryptedData.length - AUTH_TAG_LENGTH));
      const authTag = new Uint8Array(encryptedData.slice(-AUTH_TAG_LENGTH));
      const iv = new Uint8Array(Buffer.from(encrypted.keyIv, 'hex'));

      const decrypted = await mode.decrypt({ ciphertext, iv, authTag }, key);
      expect(new TextDecoder().decode(decrypted)).toBe(rawKey);
    });
  });

  // -- Mode name validation ---

  describe('mode name validation', () => {
    const validModes: readonly EncryptionModeName[] = ['password', 'env-injected', 'machine-bound'];

    for (const modeName of validModes) {
      it(`isValidMode returns true for "${modeName}"`, () => {
        expect(EncryptionModeDetector.isValidMode(modeName)).toBe(true);
      });
    }

    it('isValidMode returns false for invalid names', () => {
      const invalidNames = ['', 'MACHINE-BOUND', 'Password', 'ENV_INJECTED', 'unknown'];
      for (const name of invalidNames) {
        expect(EncryptionModeDetector.isValidMode(name)).toBe(false);
      }
    });
  });
});
