import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createWallet,
  importWallet,
  resolvePrivateKey,
  getWalletEncryptionMode,
  clearKeyCache,
} from './wallet.js';
import type { WalletFile } from './wallet.js';
import { readJsonFile, writeJsonFile } from './storage.js';
import { signPayment } from './signer.js';
import type { SignerDomain, PaymentTerms } from './signer.js';

// -- Test Fixtures ---

const TEST_DOMAIN: SignerDomain = {
  name: 'USD Coin',
  version: '2',
  verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
};

const TEST_PAYMENT: PaymentTerms = {
  network: 'eip155:324705682',
  amount: '50000', // 0.05 USDC
  payTo: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
};

// -- Helpers ---

function setupTempHome(): { tmpDir: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-integ-'));
  const origHome = process.env['HOME'];
  const origPrivKey = process.env['PAPERWALL_PRIVATE_KEY'];
  const origWalletKey = process.env['PAPERWALL_WALLET_KEY'];
  process.env['HOME'] = tmpDir;
  delete process.env['PAPERWALL_PRIVATE_KEY'];
  delete process.env['PAPERWALL_WALLET_KEY'];

  return {
    tmpDir,
    cleanup: () => {
      process.env['HOME'] = origHome;
      if (origPrivKey !== undefined) {
        process.env['PAPERWALL_PRIVATE_KEY'] = origPrivKey;
      } else {
        delete process.env['PAPERWALL_PRIVATE_KEY'];
      }
      if (origWalletKey !== undefined) {
        process.env['PAPERWALL_WALLET_KEY'] = origWalletKey;
      } else {
        delete process.env['PAPERWALL_WALLET_KEY'];
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function assertSignsPayment(privateKey: `0x${string}`): Promise<void> {
  const result = await signPayment(privateKey, TEST_DOMAIN, TEST_PAYMENT);
  const account = privateKeyToAccount(privateKey);

  expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);
  expect(result.authorization.from).toBe(account.address);
  expect(result.authorization.to).toBe(TEST_PAYMENT.payTo);
  expect(result.authorization.value).toBe(TEST_PAYMENT.amount);
}

// -- Integration Test Scenarios ---

describe('Integration: All Encryption Modes End-to-End', () => {
  let env: ReturnType<typeof setupTempHome>;

  beforeEach(() => {
    env = setupTempHome();
    clearKeyCache();
  });

  afterEach(() => {
    env.cleanup();
  });

  // =============================================
  // Scenario 1: CLI + Password Mode
  // =============================================

  describe('Scenario 1: CLI + Password Mode', () => {
    const PASSWORD = 'my-secure-password-123';

    it('should create wallet with password mode and resolve key for signing', async () => {
      const wallet = await createWallet({ mode: 'password', modeInput: PASSWORD });
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const key = await resolvePrivateKey(PASSWORD);
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);

      await assertSignsPayment(key);
    });

    it('should detect password mode from wallet metadata', async () => {
      await createWallet({ mode: 'password', modeInput: PASSWORD });
      expect(getWalletEncryptionMode()).toBe('password');
    });

    it('should fail with wrong password', async () => {
      await createWallet({ mode: 'password', modeInput: PASSWORD });
      await expect(resolvePrivateKey('wrong-password-999')).rejects.toThrow();
    });

    it('should fail without password', async () => {
      await createWallet({ mode: 'password', modeInput: PASSWORD });
      await expect(resolvePrivateKey()).rejects.toThrow('Password is required');
    });

    it('should not leak plaintext key in wallet file', async () => {
      await createWallet({ mode: 'password', modeInput: PASSWORD });
      const key = await resolvePrivateKey(PASSWORD);
      const rawHex = key.slice(2); // strip 0x

      const walletPath = path.join(env.tmpDir, '.paperwall', 'wallet.json');
      const fileContents = fs.readFileSync(walletPath, 'utf-8');
      expect(fileContents).not.toContain(rawHex);
    });
  });

  // =============================================
  // Scenario 2: CLI + Env-Injected Mode
  // =============================================

  describe('Scenario 2: CLI + Env-Injected Mode', () => {
    it('should create wallet with env-injected mode and resolve key for signing', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;

      const wallet = await createWallet({ mode: 'env-injected' });
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(getWalletEncryptionMode()).toBe('env-injected');

      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);

      await assertSignsPayment(key);
    });

    it('should fail when PAPERWALL_WALLET_KEY is missing at decrypt time', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;

      await createWallet({ mode: 'env-injected' });

      delete process.env['PAPERWALL_WALLET_KEY'];
      await expect(resolvePrivateKey()).rejects.toThrow();
    });

    it('should fail when PAPERWALL_WALLET_KEY is wrong at decrypt time', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;

      await createWallet({ mode: 'env-injected' });

      process.env['PAPERWALL_WALLET_KEY'] = crypto.randomBytes(32).toString('base64');
      await expect(resolvePrivateKey()).rejects.toThrow();
    });
  });

  // =============================================
  // Scenario 3: CLI + Machine-Bound Mode
  // =============================================

  describe('Scenario 3: CLI + Machine-Bound Mode', () => {
    it('should create wallet with machine-bound mode (default) and sign', async () => {
      const wallet = await createWallet();
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(getWalletEncryptionMode()).toBe('machine-bound');

      const key = await resolvePrivateKey();
      await assertSignsPayment(key);
    });

    it('should survive simulated pod restart (same machine identity)', async () => {
      // Create wallet
      await createWallet({ mode: 'machine-bound' });
      const key1 = await resolvePrivateKey();

      // "Restart": re-resolve without any state except the file
      const key2 = await resolvePrivateKey();
      expect(key2).toBe(key1);

      await assertSignsPayment(key2);
    });
  });

  // =============================================
  // Scenario 4: A2A + Env-Injected Mode
  // =============================================

  describe('Scenario 4: A2A + Env-Injected Mode (server decrypt + sign)', () => {
    it('should import a known key with env-injected mode, decrypt, and sign', async () => {
      const testPrivKey = 'a'.repeat(64);
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;

      const wallet = await importWallet(`0x${testPrivKey}`, { mode: 'env-injected' });
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testPrivKey}`);

      await assertSignsPayment(resolved);
    });

    it('should produce valid EIP-712 signature fields', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await createWallet({ mode: 'env-injected' });

      const key = await resolvePrivateKey();
      const result = await signPayment(key, TEST_DOMAIN, TEST_PAYMENT);

      expect(result.signature).toHaveLength(132); // 0x + 130 hex chars (65 bytes)
      expect(BigInt(result.authorization.validBefore)).toBeGreaterThan(0n);
      expect(result.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  // =============================================
  // Scenario 5: Multi-Instance A2A (same wallet, same env key)
  // =============================================

  describe('Scenario 5: Multi-Instance A2A (shared wallet + env key)', () => {
    it('should sign from two "instances" with the same wallet file and env key', async () => {
      const testPrivKey = 'b'.repeat(64);
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;

      await importWallet(`0x${testPrivKey}`, { mode: 'env-injected' });

      // Instance 1 resolves and signs
      const key1 = await resolvePrivateKey();
      expect(key1).toBe(`0x${testPrivKey}`);
      const sig1 = await signPayment(key1, TEST_DOMAIN, TEST_PAYMENT);

      // Instance 2 resolves and signs (same wallet file, same env)
      const key2 = await resolvePrivateKey();
      expect(key2).toBe(`0x${testPrivKey}`);
      const sig2 = await signPayment(key2, TEST_DOMAIN, TEST_PAYMENT);

      // Both produce valid signatures from the same address
      expect(sig1.authorization.from).toBe(sig2.authorization.from);
      expect(sig1.signature).toMatch(/^0x[0-9a-f]+$/i);
      expect(sig2.signature).toMatch(/^0x[0-9a-f]+$/i);

      // Nonces should differ (random)
      expect(sig1.authorization.nonce).not.toBe(sig2.authorization.nonce);
    });

    it('should produce consistent address across multiple resolves', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      const wallet = await createWallet({ mode: 'env-injected' });

      const keys = await Promise.all([
        resolvePrivateKey(),
        resolvePrivateKey(),
        resolvePrivateKey(),
      ]);

      // All resolve to the same key
      expect(keys[0]).toBe(keys[1]);
      expect(keys[1]).toBe(keys[2]);

      // Derived address matches wallet address
      const account = privateKeyToAccount(keys[0]!);
      expect(account.address).toBe(wallet.address);
    });
  });

  // =============================================
  // Scenario 6: Legacy Wallet Upgrade
  // =============================================

  describe('Scenario 6: Legacy Wallet Upgrade', () => {
    it('should load legacy wallet (no encryptionMode) as machine-bound and sign', async () => {
      // Create a wallet normally
      await createWallet({ mode: 'machine-bound' });
      const originalKey = await resolvePrivateKey();

      // Strip encryptionMode to simulate legacy format
      const wallet = readJsonFile<WalletFile>('wallet.json');
      const legacyWallet = {
        address: wallet!.address,
        encryptedKey: wallet!.encryptedKey,
        keySalt: wallet!.keySalt,
        keyIv: wallet!.keyIv,
        networkId: wallet!.networkId,
        // No encryptionMode field — legacy
      };
      writeJsonFile('wallet.json', legacyWallet);

      // Verify mode detection
      expect(getWalletEncryptionMode()).toBe('machine-bound');

      // Verify decrypt + sign still works
      const resolvedKey = await resolvePrivateKey();
      expect(resolvedKey).toBe(originalKey);

      await assertSignsPayment(resolvedKey);
    });

    it('should handle legacy wallet with all valid wallet file fields', async () => {
      await createWallet();
      const wallet = readJsonFile<WalletFile>('wallet.json');

      // Verify the legacy wallet has required fields
      expect(wallet).toHaveProperty('address');
      expect(wallet).toHaveProperty('encryptedKey');
      expect(wallet).toHaveProperty('keySalt');
      expect(wallet).toHaveProperty('keyIv');
      expect(wallet).toHaveProperty('networkId');

      // Strip encryptionMode
      const legacyWallet = {
        address: wallet!.address,
        encryptedKey: wallet!.encryptedKey,
        keySalt: wallet!.keySalt,
        keyIv: wallet!.keyIv,
        networkId: wallet!.networkId,
      };
      writeJsonFile('wallet.json', legacyWallet);

      // Should still work
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  // =============================================
  // Scenario 7: Mode Switching
  // =============================================

  describe('Scenario 7: Mode Switching', () => {
    const KNOWN_KEY = 'ab'.repeat(32);

    it('should switch from password mode to env-injected mode preserving the key', async () => {
      // Step 1: Import with password mode
      const password = 'switching-test-pw-123';
      await importWallet(`0x${KNOWN_KEY}`, { mode: 'password', modeInput: password });
      expect(getWalletEncryptionMode()).toBe('password');

      const keyFromPassword = await resolvePrivateKey(password);
      expect(keyFromPassword).toBe(`0x${KNOWN_KEY}`);

      // Step 2: Re-import same key with env-injected mode (force)
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await importWallet(`0x${KNOWN_KEY}`, { mode: 'env-injected', force: true });
      expect(getWalletEncryptionMode()).toBe('env-injected');

      const keyFromEnv = await resolvePrivateKey();
      expect(keyFromEnv).toBe(`0x${KNOWN_KEY}`);

      // Both produce the same signing result (same key, same address)
      const account = privateKeyToAccount(`0x${KNOWN_KEY}`);
      expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      await assertSignsPayment(keyFromEnv);
    });

    it('should switch from machine-bound to password mode', async () => {
      await createWallet({ mode: 'machine-bound' });
      const originalKey = await resolvePrivateKey();
      expect(getWalletEncryptionMode()).toBe('machine-bound');

      // Re-import with password mode
      const password = 'new-password-456';
      await importWallet(originalKey, { mode: 'password', modeInput: password, force: true });
      expect(getWalletEncryptionMode()).toBe('password');

      const resolvedKey = await resolvePrivateKey(password);
      expect(resolvedKey).toBe(originalKey);

      await assertSignsPayment(resolvedKey);
    });

    it('should switch from env-injected to machine-bound mode', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await importWallet(`0x${KNOWN_KEY}`, { mode: 'env-injected' });
      expect(getWalletEncryptionMode()).toBe('env-injected');

      // Re-import with machine-bound (force)
      await importWallet(`0x${KNOWN_KEY}`, { mode: 'machine-bound', force: true });
      expect(getWalletEncryptionMode()).toBe('machine-bound');

      const resolvedKey = await resolvePrivateKey();
      expect(resolvedKey).toBe(`0x${KNOWN_KEY}`);

      await assertSignsPayment(resolvedKey);
    });

    it('should isolate modes: password wallet cannot be decrypted without password after switch', async () => {
      const password = 'isolation-test-pw-789';
      await importWallet(`0x${KNOWN_KEY}`, { mode: 'password', modeInput: password });

      // Verify password is required
      await expect(resolvePrivateKey()).rejects.toThrow('Password is required');

      // Switch to machine-bound
      await importWallet(`0x${KNOWN_KEY}`, { mode: 'machine-bound', force: true });

      // Now machine-bound works without password
      const key = await resolvePrivateKey();
      expect(key).toBe(`0x${KNOWN_KEY}`);
    });
  });
});
