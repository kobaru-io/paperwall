import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  createWallet,
  importWallet,
  getAddress,
  resolvePrivateKey,
  getWalletEncryptionMode,
} from './wallet.js';
import type { WalletFile } from './wallet.js';
import { readJsonFile, writeJsonFile } from './storage.js';

describe('wallet', () => {
  let originalHome: string | undefined;
  let originalPrivateKeyEnv: string | undefined;
  let originalWalletKeyEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-wallet-test-'));
    originalHome = process.env['HOME'];
    originalPrivateKeyEnv = process.env['PAPERWALL_PRIVATE_KEY'];
    originalWalletKeyEnv = process.env['PAPERWALL_WALLET_KEY'];
    process.env['HOME'] = tmpDir;
    delete process.env['PAPERWALL_PRIVATE_KEY'];
    delete process.env['PAPERWALL_WALLET_KEY'];
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    if (originalPrivateKeyEnv !== undefined) {
      process.env['PAPERWALL_PRIVATE_KEY'] = originalPrivateKeyEnv;
    } else {
      delete process.env['PAPERWALL_PRIVATE_KEY'];
    }
    if (originalWalletKeyEnv !== undefined) {
      process.env['PAPERWALL_WALLET_KEY'] = originalWalletKeyEnv;
    } else {
      delete process.env['PAPERWALL_WALLET_KEY'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // =============================================
  // Existing tests (backward compatibility)
  // =============================================

  describe('createWallet', () => {
    it('should create wallet with valid address and storage path', async () => {
      const result = await createWallet();
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.network).toBe('eip155:324705682');
      expect(result.storagePath).toContain('wallet.json');
    });

    it('should persist encrypted wallet to disk', async () => {
      await createWallet();
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet).not.toBeNull();
      expect(wallet?.address).toMatch(/^0x/);
      expect(wallet?.encryptedKey).toBeDefined();
      expect(wallet?.keySalt).toBeDefined();
      expect(wallet?.keyIv).toBeDefined();
      expect(wallet?.networkId).toBe('eip155:324705682');
    });

    it('should use specified network', async () => {
      const result = await createWallet('eip155:1187947933');
      expect(result.network).toBe('eip155:1187947933');
    });

    it('should refuse to overwrite existing wallet', async () => {
      await createWallet();
      await expect(createWallet()).rejects.toThrow('Wallet already exists');
    });

    it('should overwrite existing wallet with force flag', async () => {
      const first = await createWallet();
      const second = await createWallet({ force: true });
      expect(second.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(second.address).not.toBe(first.address);
    });
  });

  describe('importWallet', () => {
    it('should import a valid private key and return address', async () => {
      const rawKey = 'a'.repeat(64);
      const result = await importWallet(`0x${rawKey}`);
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.network).toBe('eip155:324705682');
      expect(result.storagePath).toContain('wallet.json');
    });

    it('should accept key without 0x prefix', async () => {
      const rawKey = 'b'.repeat(64);
      const result = await importWallet(rawKey);
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should persist encrypted wallet to disk', async () => {
      await importWallet('0x' + 'c'.repeat(64));
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet).not.toBeNull();
      expect(wallet?.address).toMatch(/^0x/);
      expect(wallet?.encryptedKey).toBeDefined();
      expect(wallet?.keySalt).toBeDefined();
      expect(wallet?.keyIv).toBeDefined();
    });

    it('should decrypt back to the imported key', async () => {
      const rawKey = 'd'.repeat(64);
      await importWallet(`0x${rawKey}`);
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${rawKey}`);
    });

    it('should reject invalid key (too short)', async () => {
      await expect(importWallet('0xabc')).rejects.toThrow('Invalid private key');
    });

    it('should reject invalid key (non-hex)', async () => {
      await expect(importWallet('0x' + 'g'.repeat(64))).rejects.toThrow('Invalid private key');
    });

    it('should use specified network', async () => {
      const result = await importWallet('a'.repeat(64), 'eip155:1187947933');
      expect(result.network).toBe('eip155:1187947933');
    });

    it('should refuse to overwrite existing wallet', async () => {
      await importWallet('0x' + 'a'.repeat(64));
      await expect(importWallet('0x' + 'b'.repeat(64))).rejects.toThrow('Wallet already exists');
    });

    it('should overwrite existing wallet with force flag', async () => {
      await importWallet('0x' + 'a'.repeat(64));
      const result = await importWallet('0x' + 'b'.repeat(64), { force: true });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  describe('getAddress', () => {
    it('should return address from stored wallet', async () => {
      const created = await createWallet();
      const address = await getAddress();
      expect(address).toBe(created.address);
    });

    it('should throw if no wallet exists', async () => {
      await expect(getAddress()).rejects.toThrow();
    });
  });

  describe('resolvePrivateKey', () => {
    it('should resolve from PAPERWALL_PRIVATE_KEY env var first', async () => {
      const hexKey = '0x' + 'a'.repeat(64);
      process.env['PAPERWALL_PRIVATE_KEY'] = hexKey;
      const key = await resolvePrivateKey();
      expect(key).toBe(hexKey);
    });

    it('should resolve from machine-bound wallet file', async () => {
      await createWallet();
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should prefer PAPERWALL_PRIVATE_KEY over wallet file', async () => {
      const directKey = '0x' + 'b'.repeat(64);
      process.env['PAPERWALL_PRIVATE_KEY'] = directKey;
      await createWallet();
      const key = await resolvePrivateKey();
      expect(key).toBe(directKey);
    });

    it('should throw when no wallet file exists', async () => {
      await expect(resolvePrivateKey()).rejects.toThrow('No wallet configured');
    });
  });

  // =============================================
  // ST-005-01: Wallet file schema with encryptionMode metadata
  // =============================================

  describe('wallet file schema', () => {
    it('should include encryptionMode field in wallet file', async () => {
      await createWallet();
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('machine-bound');
    });

    it('should store encryptionMode as machine-bound by default', async () => {
      await createWallet();
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('machine-bound');
    });

    it('should store encryptionMode as password when specified', async () => {
      await createWallet({ mode: 'password', modeInput: 'my-strong-password-123' });
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('password');
    });

    it('should store encryptionMode as env-injected when specified', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await createWallet({ mode: 'env-injected' });
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('env-injected');
    });
  });

  // =============================================
  // ST-005-02: createWallet() with mode selection
  // =============================================

  describe('createWallet with mode selection', () => {
    it('should create wallet with machine-bound mode (explicit)', async () => {
      const result = await createWallet({ mode: 'machine-bound' });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should create wallet with password mode', async () => {
      const password = 'my-strong-password-123';
      const result = await createWallet({ mode: 'password', modeInput: password });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      // Should decrypt with same password
      const key = await resolvePrivateKey(password);
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should create wallet with env-injected mode', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      const result = await createWallet({ mode: 'env-injected' });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      // Should decrypt with same env var
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should reject password mode without modeInput', async () => {
      await expect(createWallet({ mode: 'password' })).rejects.toThrow(
        'Password is required',
      );
    });

    it('should reject password mode with weak password', async () => {
      await expect(
        createWallet({ mode: 'password', modeInput: 'short' }),
      ).rejects.toThrow();
    });

    it('should create wallet with mode and custom network', async () => {
      const result = await createWallet({
        mode: 'machine-bound',
        network: 'eip155:1187947933',
      });
      expect(result.network).toBe('eip155:1187947933');
    });

    it('should create wallet with mode and force flag', async () => {
      await createWallet();
      const second = await createWallet({
        mode: 'password',
        modeInput: 'my-strong-password-123',
        force: true,
      });
      expect(second.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('password');
    });
  });

  // =============================================
  // ST-005-03: importWallet() with mode selection
  // =============================================

  describe('importWallet with mode selection', () => {
    const testKey = 'e'.repeat(64);

    it('should import wallet with machine-bound mode (explicit)', async () => {
      const result = await importWallet(`0x${testKey}`, { mode: 'machine-bound' });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should import wallet with password mode', async () => {
      const password = 'my-strong-password-123';
      const result = await importWallet(`0x${testKey}`, { mode: 'password', modeInput: password });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const resolved = await resolvePrivateKey(password);
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should import wallet with env-injected mode', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      const result = await importWallet(`0x${testKey}`, { mode: 'env-injected' });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should reject password mode without modeInput', async () => {
      await expect(
        importWallet(`0x${testKey}`, { mode: 'password' }),
      ).rejects.toThrow('Password is required');
    });

    it('should import with mode and force', async () => {
      await importWallet(`0x${testKey}`);
      const result = await importWallet('0x' + '1'.repeat(64), {
        mode: 'password',
        modeInput: 'my-strong-password-123',
        force: true,
      });
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('password');
    });

    it('should import with mode and custom network', async () => {
      const result = await importWallet(`0x${testKey}`, {
        mode: 'machine-bound',
        network: 'eip155:1187947933',
      });
      expect(result.network).toBe('eip155:1187947933');
    });
  });

  // =============================================
  // ST-005-04: resolvePrivateKey() with auto-detection
  // =============================================

  describe('resolvePrivateKey with auto-detection', () => {
    const testKey = 'a'.repeat(64);

    it('should auto-detect machine-bound mode from wallet metadata', async () => {
      await importWallet(`0x${testKey}`, { mode: 'machine-bound' });
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should auto-detect password mode from wallet metadata', async () => {
      const password = 'my-strong-password-123';
      await importWallet(`0x${testKey}`, { mode: 'password', modeInput: password });
      const resolved = await resolvePrivateKey(password);
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should auto-detect env-injected mode from wallet metadata', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await importWallet(`0x${testKey}`, { mode: 'env-injected' });
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should fail to decrypt password wallet without modeInput', async () => {
      const password = 'my-strong-password-123';
      await importWallet(`0x${testKey}`, { mode: 'password', modeInput: password });
      await expect(resolvePrivateKey()).rejects.toThrow('Password is required');
    });

    it('should fail to decrypt password wallet with wrong password', async () => {
      const password = 'my-strong-password-123';
      await importWallet(`0x${testKey}`, { mode: 'password', modeInput: password });
      await expect(resolvePrivateKey('wrong-password-456')).rejects.toThrow();
    });

    it('should still prefer PAPERWALL_PRIVATE_KEY over encrypted wallet', async () => {
      const directKey = '0x' + 'b'.repeat(64);
      process.env['PAPERWALL_PRIVATE_KEY'] = directKey;
      await importWallet(`0x${testKey}`, { mode: 'password', modeInput: 'my-strong-password-123' });
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(directKey);
    });
  });

  // =============================================
  // ST-005-05: Wallet storage (0o600 permissions)
  // =============================================

  describe('wallet storage permissions', () => {
    it('should create wallet file with 0o600 permissions', async () => {
      await createWallet();
      const walletPath = path.join(tmpDir, '.paperwall', 'wallet.json');
      const stats = fs.statSync(walletPath);
      // 0o600 = owner read/write only
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should create config directory with 0o700 permissions', async () => {
      await createWallet();
      const configDir = path.join(tmpDir, '.paperwall');
      const stats = fs.statSync(configDir);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });
  });

  // =============================================
  // ST-005-06: Error handling
  // =============================================

  describe('error handling', () => {
    it('should throw clear error when no wallet exists for getAddress', async () => {
      await expect(getAddress()).rejects.toThrow('No wallet configured');
    });

    it('should throw clear error when no wallet exists for resolvePrivateKey', async () => {
      await expect(resolvePrivateKey()).rejects.toThrow('No wallet configured');
    });

    it('should throw when trying to overwrite without force', async () => {
      await createWallet();
      await expect(createWallet()).rejects.toThrow('Use --force to overwrite');
    });

    it('should throw on unsupported network', async () => {
      await expect(createWallet('eip155:999999999')).rejects.toThrow();
    });

    it('should throw on invalid private key format for import', async () => {
      await expect(importWallet('not-hex-at-all')).rejects.toThrow('Invalid private key');
    });

    it('should throw on empty private key for import', async () => {
      await expect(importWallet('')).rejects.toThrow('Invalid private key');
    });

    it('should fail to decrypt env-injected wallet when env var is missing', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await createWallet({ mode: 'env-injected' });
      delete process.env['PAPERWALL_WALLET_KEY'];
      await expect(resolvePrivateKey()).rejects.toThrow();
    });

    it('should fail to decrypt env-injected wallet with wrong env var', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await createWallet({ mode: 'env-injected' });
      process.env['PAPERWALL_WALLET_KEY'] = crypto.randomBytes(32).toString('base64');
      await expect(resolvePrivateKey()).rejects.toThrow();
    });
  });

  // =============================================
  // ST-005-07: Backward compatibility (legacy wallets)
  // =============================================

  describe('backward compatibility', () => {
    it('should treat wallet without encryptionMode as machine-bound', async () => {
      // Simulate legacy wallet (no encryptionMode field)
      await createWallet();
      const wallet = readJsonFile<WalletFile>('wallet.json');
      // Remove encryptionMode to simulate legacy format
      const legacyWallet = {
        address: wallet!.address,
        encryptedKey: wallet!.encryptedKey,
        keySalt: wallet!.keySalt,
        keyIv: wallet!.keyIv,
        networkId: wallet!.networkId,
        // No encryptionMode field
      };
      writeJsonFile('wallet.json', legacyWallet);

      // Should still decrypt using machine-bound mode
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should detect legacy wallet as machine-bound mode', async () => {
      await createWallet();
      const wallet = readJsonFile<WalletFile>('wallet.json');
      const legacyWallet = {
        address: wallet!.address,
        encryptedKey: wallet!.encryptedKey,
        keySalt: wallet!.keySalt,
        keyIv: wallet!.keyIv,
        networkId: wallet!.networkId,
      };
      writeJsonFile('wallet.json', legacyWallet);

      const mode = getWalletEncryptionMode();
      expect(mode).toBe('machine-bound');
    });

    it('should return correct mode for new wallets', async () => {
      await createWallet({ mode: 'password', modeInput: 'my-strong-password-123' });
      const mode = getWalletEncryptionMode();
      expect(mode).toBe('password');
    });

    it('should return undefined when no wallet exists', () => {
      const mode = getWalletEncryptionMode();
      expect(mode).toBeUndefined();
    });
  });

  // =============================================
  // ST-005-08: Integration tests (all modes + legacy)
  // =============================================

  describe('integration: round-trip all modes', () => {
    const testKey = 'c'.repeat(64);

    it('should round-trip create+resolve with machine-bound mode', async () => {
      const created = await createWallet({ mode: 'machine-bound' });
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
      expect(created.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should round-trip import+resolve with machine-bound mode', async () => {
      await importWallet(`0x${testKey}`, { mode: 'machine-bound' });
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should round-trip create+resolve with password mode', async () => {
      const pw = 'integration-test-pw-123';
      const created = await createWallet({ mode: 'password', modeInput: pw });
      const key = await resolvePrivateKey(pw);
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
      expect(created.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should round-trip import+resolve with password mode', async () => {
      const pw = 'integration-test-pw-456';
      await importWallet(`0x${testKey}`, { mode: 'password', modeInput: pw });
      const resolved = await resolvePrivateKey(pw);
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should round-trip create+resolve with env-injected mode', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      const created = await createWallet({ mode: 'env-injected' });
      const key = await resolvePrivateKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
      expect(created.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should round-trip import+resolve with env-injected mode', async () => {
      const envKey = crypto.randomBytes(32).toString('base64');
      process.env['PAPERWALL_WALLET_KEY'] = envKey;
      await importWallet(`0x${testKey}`, { mode: 'env-injected' });
      const resolved = await resolvePrivateKey();
      expect(resolved).toBe(`0x${testKey}`);
    });

    it('should switch modes by force-overwriting wallet', async () => {
      // Start with machine-bound
      await createWallet({ mode: 'machine-bound' });
      const key1 = await resolvePrivateKey();

      // Switch to password mode
      const pw = 'switching-modes-pw-789';
      await importWallet(key1, { mode: 'password', modeInput: pw, force: true });
      const key2 = await resolvePrivateKey(pw);
      expect(key2).toBe(key1);

      const wallet = readJsonFile<WalletFile>('wallet.json');
      expect(wallet?.encryptionMode).toBe('password');
    });

    it('should create distinct wallets for each mode', async () => {
      // Create machine-bound wallet
      const mbWallet = await createWallet({ mode: 'machine-bound' });
      const mbFile = readJsonFile<WalletFile>('wallet.json');

      // Switch to password
      const pw = 'distinct-wallets-pw-101';
      const pwWallet = await createWallet({ mode: 'password', modeInput: pw, force: true });
      const pwFile = readJsonFile<WalletFile>('wallet.json');

      // Addresses should differ (different keys)
      expect(mbWallet.address).not.toBe(pwWallet.address);
      // Encryption mode metadata should differ
      expect(mbFile?.encryptionMode).toBe('machine-bound');
      expect(pwFile?.encryptionMode).toBe('password');
    });
  });
});
