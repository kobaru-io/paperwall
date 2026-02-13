import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createWallet, importWallet, getAddress, resolvePrivateKey } from './wallet.js';
import { readJsonFile } from './storage.js';

describe('wallet', () => {
  let originalHome: string | undefined;
  let originalPrivateKeyEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-wallet-test-'));
    originalHome = process.env['HOME'];
    originalPrivateKeyEnv = process.env['PAPERWALL_PRIVATE_KEY'];
    process.env['HOME'] = tmpDir;
    delete process.env['PAPERWALL_PRIVATE_KEY'];
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    if (originalPrivateKeyEnv !== undefined) {
      process.env['PAPERWALL_PRIVATE_KEY'] = originalPrivateKeyEnv;
    } else {
      delete process.env['PAPERWALL_PRIVATE_KEY'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createWallet', () => {
    it('should create wallet with valid address and storage path', async () => {
      const result = await createWallet();
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.network).toBe('eip155:324705682');
      expect(result.storagePath).toContain('wallet.json');
    });

    it('should persist encrypted wallet to disk', async () => {
      await createWallet();
      const wallet = readJsonFile<{
        address: string;
        encryptedKey: string;
        keySalt: string;
        keyIv: string;
        networkId: string;
      }>('wallet.json');
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
      const wallet = readJsonFile<{
        address: string;
        encryptedKey: string;
        keySalt: string;
        keyIv: string;
        networkId: string;
      }>('wallet.json');
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
});
