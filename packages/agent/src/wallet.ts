import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import type { EncryptionMode, EncryptionKey } from './encryption-mode.js';
import { DecryptionError } from './encryption-mode.js';
import {
  EncryptionModeDetector,
  MachineBindingMode,
  getMachineIdentity,
} from './modes.js';
import type { EncryptionModeName } from './modes.js';
import { wipeBuffer, wipeString } from './key-wipe.js';
import {
  getConfigDir,
  readJsonFile,
  writeJsonFile,
} from './storage.js';
import { getNetwork } from './networks.js';
import { smallestToUsdc } from './budget.js';
import { KeyCache } from './key-cache.js';

// -- Constants ---

const DEFAULT_NETWORK = 'eip155:324705682';
const WALLET_FILENAME = 'wallet.json';

// -- Types ---

export type KeyStorage = 'file' | 'keychain';

export interface WalletInfo {
  readonly address: string;
  readonly network: string;
  readonly storagePath: string;
}

/**
 * Wallet file schema. The encryptionMode field is optional for backward
 * compatibility with legacy wallets (which are machine-bound).
 */
export interface WalletFile {
  readonly address: string;
  readonly encryptedKey: string;
  readonly keySalt: string;
  readonly keyIv: string;
  readonly networkId: string;
  readonly encryptionMode?: EncryptionModeName;
  readonly keyStorage?: KeyStorage;
}

export interface MigrateResult {
  readonly address: string;
  readonly from: KeyStorage;
  readonly to: KeyStorage;
  readonly network: string;
}

export interface BalanceInfo {
  readonly address: string;
  readonly balance: string;
  readonly balanceFormatted: string;
  readonly asset: string;
  readonly network: string;
}

export interface CreateWalletOptions {
  readonly network?: string;
  readonly force?: boolean;
  readonly mode?: EncryptionModeName;
  readonly modeInput?: string;
  readonly keychain?: boolean;
}

export interface ImportWalletOptions {
  readonly network?: string;
  readonly force?: boolean;
  readonly mode?: EncryptionModeName;
  readonly modeInput?: string;
  readonly keychain?: boolean;
}

// -- Internal Helpers ---

function validatePrivateKeyFormat(key: string): asserts key is `0x${string}` {
  if (!key.startsWith('0x')) {
    throw new Error('Private key must start with 0x');
  }
  if (key.length !== 66) {
    throw new Error('Private key must be 66 characters (0x + 64 hex digits)');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('Private key must be valid hex');
  }
}

const detector = new EncryptionModeDetector();
const keyCache = new KeyCache();
keyCache.registerExitHandler();

function generatePrivateKeyHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('hex');
}

function resolveEncryptionMode(modeName: EncryptionModeName): EncryptionMode {
  return detector.resolveMode(modeName);
}

function getModeInput(modeName: EncryptionModeName, modeInput?: string): string | Uint8Array {
  switch (modeName) {
    case 'machine-bound':
      return getMachineIdentity();
    case 'password':
      if (!modeInput) {
        throw new Error(
          'Password is required for password-encrypted wallets. Pass modeInput with the password.',
        );
      }
      return modeInput;
    case 'env-injected':
      // EnvInjectedEncryptionMode reads from env internally; input is ignored
      return new Uint8Array(0);
    default:
      throw new Error(`Unsupported encryption mode: ${modeName as string}`);
  }
}

async function encryptWithMode(
  rawKey: string,
  modeName: EncryptionModeName,
  modeInput?: string,
): Promise<{ encryptedKey: string; keySalt: string; keyIv: string }> {
  const mode = resolveEncryptionMode(modeName);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode(rawKey);
  const input = getModeInput(modeName, modeInput);

  const key = await mode.deriveKey(salt, input);
  const encrypted = await mode.encrypt(plaintext, key);

  // Combine ciphertext + authTag for backward-compatible hex format
  const combined = new Uint8Array(encrypted.ciphertext.length + encrypted.authTag.length);
  combined.set(encrypted.ciphertext, 0);
  combined.set(encrypted.authTag, encrypted.ciphertext.length);

  // Wipe plaintext buffer
  wipeBuffer(plaintext);

  return {
    encryptedKey: Buffer.from(combined).toString('hex'),
    keySalt: Buffer.from(salt).toString('hex'),
    keyIv: Buffer.from(encrypted.iv).toString('hex'),
  };
}

async function decryptWithMode(
  wallet: WalletFile,
  modeInput?: string,
): Promise<string> {
  const modeName = detector.detectMode({ encryptionMode: wallet.encryptionMode });
  const mode = resolveEncryptionMode(modeName);
  const input = getModeInput(modeName, modeInput);

  const encryptedData = Buffer.from(wallet.encryptedKey, 'hex');
  const salt = new Uint8Array(Buffer.from(wallet.keySalt, 'hex'));
  const iv = new Uint8Array(Buffer.from(wallet.keyIv, 'hex'));

  // Split combined data into ciphertext + authTag (last 16 bytes)
  const AUTH_TAG_LENGTH = 16;
  const ciphertext = new Uint8Array(encryptedData.slice(0, encryptedData.length - AUTH_TAG_LENGTH));
  const authTag = new Uint8Array(encryptedData.slice(-AUTH_TAG_LENGTH));

  const key = await mode.deriveKey(salt, input);
  const decrypted = await mode.decrypt({ ciphertext, iv, authTag }, key);

  const result = new TextDecoder().decode(decrypted);

  // Wipe decrypted buffer
  wipeBuffer(decrypted);

  return result;
}

function assertNoExistingWallet(): void {
  const existing = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (existing) {
    throw new Error(
      `Wallet already exists (address: ${existing.address}). Use --force to overwrite.`,
    );
  }
}

// -- Public API ---

export function getKeyStorage(wallet: WalletFile): KeyStorage {
  return wallet.keyStorage ?? 'file';
}

export async function createWallet(
  networkOrOptions?: string | CreateWalletOptions,
): Promise<WalletInfo> {
  const opts = typeof networkOrOptions === 'string'
    ? { network: networkOrOptions }
    : networkOrOptions ?? {};
  const networkId = opts.network ?? DEFAULT_NETWORK;
  const modeName: EncryptionModeName = opts.mode ?? 'machine-bound';
  // Validate network is known (throws if unsupported)
  getNetwork(networkId);

  if (!opts.force) {
    assertNoExistingWallet();
  }

  if (opts.keychain) {
    if (opts.mode && opts.mode !== 'machine-bound') {
      throw new Error(
        'Cannot use --keychain with --mode. Keychain storage does not use encryption modes — the OS keychain provides protection.',
      );
    }

    const { detectKeychainAvailability, loadKeychainAdapter, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, KeychainUnavailableError } =
      await import('./keychain.js');
    const availability = await detectKeychainAvailability();
    if (!availability.available) {
      throw new KeychainUnavailableError(
        `OS keychain is not available: ${availability.reason}`,
      );
    }

    const rawKey = generatePrivateKeyHex();
    const hexKey = `0x${rawKey}` as `0x${string}`;
    const account = privateKeyToAccount(hexKey);

    const adapter = await loadKeychainAdapter();
    if (!adapter) {
      throw new KeychainUnavailableError('Keychain adapter failed to load');
    }
    await adapter.store(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, rawKey);
    wipeString(rawKey);

    const walletData: WalletFile = {
      address: account.address,
      encryptedKey: '',
      keySalt: '',
      keyIv: '',
      networkId,
      keyStorage: 'keychain',
    };
    writeJsonFile(WALLET_FILENAME, walletData);

    const storagePath = path.join(getConfigDir(), WALLET_FILENAME);
    return { address: account.address, network: networkId, storagePath };
  }

  const rawKey = generatePrivateKeyHex();
  const hexKey = `0x${rawKey}` as `0x${string}`;
  const account = privateKeyToAccount(hexKey);
  const encrypted = await encryptWithMode(rawKey, modeName, opts.modeInput);

  const walletData: WalletFile = {
    address: account.address,
    encryptedKey: encrypted.encryptedKey,
    keySalt: encrypted.keySalt,
    keyIv: encrypted.keyIv,
    networkId,
    encryptionMode: modeName,
  };

  writeJsonFile(WALLET_FILENAME, walletData);

  const storagePath = path.join(getConfigDir(), WALLET_FILENAME);

  return {
    address: account.address,
    network: networkId,
    storagePath,
  };
}

export async function importWallet(
  privateKeyHex: string,
  networkOrOptions?: string | ImportWalletOptions,
): Promise<WalletInfo> {
  const opts = typeof networkOrOptions === 'string'
    ? { network: networkOrOptions }
    : networkOrOptions ?? {};
  const networkId = opts.network ?? DEFAULT_NETWORK;
  const modeName: EncryptionModeName = opts.mode ?? 'machine-bound';
  getNetwork(networkId);

  if (!opts.force) {
    assertNoExistingWallet();
  }

  // Normalize: strip 0x prefix if present
  const normalizedKey = privateKeyHex.startsWith('0x')
    ? privateKeyHex.slice(2)
    : privateKeyHex;

  // Validate: must be exactly 64 hex characters
  if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new Error(
      'Invalid private key: must be 64 hex characters (with optional 0x prefix)',
    );
  }

  if (opts.keychain) {
    if (opts.mode && opts.mode !== 'machine-bound') {
      throw new Error(
        'Cannot use --keychain with --mode. Keychain storage does not use encryption modes — the OS keychain provides protection.',
      );
    }

    const { detectKeychainAvailability, loadKeychainAdapter, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, KeychainUnavailableError } =
      await import('./keychain.js');
    const availability = await detectKeychainAvailability();
    if (!availability.available) {
      throw new KeychainUnavailableError(
        `OS keychain is not available: ${availability.reason}`,
      );
    }

    const hexKey = `0x${normalizedKey}` as `0x${string}`;
    const account = privateKeyToAccount(hexKey);

    const adapter = await loadKeychainAdapter();
    if (!adapter) {
      throw new KeychainUnavailableError('Keychain adapter failed to load');
    }
    await adapter.store(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, normalizedKey);
    wipeString(normalizedKey);

    const walletData: WalletFile = {
      address: account.address,
      encryptedKey: '',
      keySalt: '',
      keyIv: '',
      networkId,
      keyStorage: 'keychain',
    };
    writeJsonFile(WALLET_FILENAME, walletData);

    const storagePath = path.join(getConfigDir(), WALLET_FILENAME);
    return { address: account.address, network: networkId, storagePath };
  }

  const hexKey = `0x${normalizedKey}` as `0x${string}`;
  const account = privateKeyToAccount(hexKey);
  const encrypted = await encryptWithMode(normalizedKey, modeName, opts.modeInput);

  const walletData: WalletFile = {
    address: account.address,
    encryptedKey: encrypted.encryptedKey,
    keySalt: encrypted.keySalt,
    keyIv: encrypted.keyIv,
    networkId,
    encryptionMode: modeName,
  };

  writeJsonFile(WALLET_FILENAME, walletData);

  const storagePath = path.join(getConfigDir(), WALLET_FILENAME);

  return {
    address: account.address,
    network: networkId,
    storagePath,
  };
}

export async function getAddress(): Promise<string> {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error('No wallet configured. Run: paperwall wallet create');
  }
  return wallet.address;
}

/**
 * Resolve the private key for signing transactions (cached).
 *
 * Priority:
 * 1. PAPERWALL_PRIVATE_KEY env var (direct, no decryption)
 * 2. OS keychain (if wallet keyStorage === 'keychain')
 * 3. Encrypted wallet file (auto-detects encryption mode)
 *
 * @param modeInput - Mode-specific input (password for password mode). Not needed for machine-bound or env-injected.
 */
export async function resolvePrivateKey(modeInput?: string): Promise<`0x${string}`> {
  return keyCache.getOrResolve(() => resolvePrivateKeyUncached(modeInput));
}

/**
 * Clear the cached private key. Useful for testing and process cleanup.
 */
export function clearKeyCache(): void {
  keyCache.clear();
}

async function resolvePrivateKeyUncached(modeInput?: string): Promise<`0x${string}`> {
  // Priority 1: PAPERWALL_PRIVATE_KEY env var
  const envKey = process.env['PAPERWALL_PRIVATE_KEY'];
  if (envKey) {
    validatePrivateKeyFormat(envKey);
    return envKey as `0x${string}`;
  }

  // Read wallet file
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error(
      'No wallet configured. Run: paperwall wallet create',
    );
  }

  const storage = getKeyStorage(wallet);

  // Priority 2: OS Keychain
  if (storage === 'keychain') {
    const { detectKeychainAvailability, loadKeychainAdapter, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT } =
      await import('./keychain.js');
    const availability = await detectKeychainAvailability();
    if (!availability.available) {
      throw new Error(
        `Wallet is configured to use OS keychain, but keychain is unavailable: ${availability.reason}. ` +
        'Use PAPERWALL_PRIVATE_KEY env var as a workaround, or migrate with: paperwall wallet migrate to-file',
      );
    }
    const adapter = await loadKeychainAdapter();
    if (!adapter) {
      throw new Error('Keychain adapter failed to load after availability check passed.');
    }
    const secret = await adapter.retrieve(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (!secret) {
      throw new Error(
        'Wallet is configured to use OS keychain, but no key found in keychain. ' +
        'Re-import your key with: paperwall wallet import --key 0x... --keychain',
      );
    }
    return `0x${secret}`;
  }

  // Priority 3: Encrypted wallet file (auto-detects encryption mode)
  const rawKey = await decryptWithMode(wallet, modeInput);
  return `0x${rawKey}`;
}

/**
 * Get the encryption mode of the current wallet.
 * Returns undefined if no wallet exists.
 */
export function getWalletEncryptionMode(): EncryptionModeName | undefined {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    return undefined;
  }
  return detector.detectMode({ encryptionMode: wallet.encryptionMode });
}

export async function getBalance(network?: string): Promise<BalanceInfo> {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error('No wallet configured. Run: paperwall wallet create');
  }

  const networkId = network ?? wallet.networkId;
  const networkConfig = getNetwork(networkId);

  // ABI-encode balanceOf(address): selector 0x70a08231 + address padded to 32 bytes
  const addressWithoutPrefix = wallet.address.toLowerCase().replace('0x', '');
  const paddedAddress = addressWithoutPrefix.padStart(64, '0');
  const callData = `0x70a08231${paddedAddress}`;

  const response = await fetch(networkConfig.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: networkConfig.usdcAddress,
          data: callData,
        },
        'latest',
      ],
    }),
  });

  const json = (await response.json()) as { result?: string; error?: { message: string } };

  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }

  const hexBalance = json.result;
  const balance = (!hexBalance || hexBalance === '0x') ? 0n : BigInt(hexBalance);
  const balanceFormatted = smallestToUsdc(balance.toString());

  return {
    address: wallet.address,
    balance: balance.toString(),
    balanceFormatted,
    asset: 'USDC',
    network: networkId,
  };
}

export async function migrateToKeychain(modeInput?: string): Promise<MigrateResult> {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error('No wallet configured. Run: paperwall wallet create');
  }

  if (getKeyStorage(wallet) === 'keychain') {
    throw new Error('Wallet already uses keychain storage');
  }

  const {
    detectKeychainAvailability,
    loadKeychainAdapter,
    KEYCHAIN_SERVICE,
    KEYCHAIN_ACCOUNT,
    KeychainUnavailableError,
  } = await import('./keychain.js');

  const availability = await detectKeychainAvailability();
  if (!availability.available) {
    throw new KeychainUnavailableError(
      `OS keychain is not available: ${availability.reason}`,
    );
  }

  // Decrypt from file
  const rawKey = await decryptWithMode(wallet, modeInput);

  const adapter = await loadKeychainAdapter();
  if (!adapter) {
    throw new KeychainUnavailableError('Keychain adapter failed to load');
  }

  // Store in keychain
  await adapter.store(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, rawKey);

  // Verify: retrieve and compare
  const retrieved = await adapter.retrieve(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  if (retrieved !== rawKey) {
    await adapter.delete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    throw new Error('Keychain verification failed: stored key does not match original');
  }

  wipeString(rawKey);

  // Rewrite wallet.json
  const updatedWallet: WalletFile = {
    address: wallet.address,
    encryptedKey: '',
    keySalt: '',
    keyIv: '',
    networkId: wallet.networkId,
    keyStorage: 'keychain',
  };
  writeJsonFile(WALLET_FILENAME, updatedWallet);

  clearKeyCache();

  return {
    address: wallet.address,
    from: 'file',
    to: 'keychain',
    network: wallet.networkId,
  };
}

export async function migrateToFile(
  mode?: EncryptionModeName,
  modeInput?: string,
): Promise<MigrateResult> {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error('No wallet configured. Run: paperwall wallet create');
  }

  if (getKeyStorage(wallet) !== 'keychain') {
    throw new Error('Wallet already uses file storage');
  }

  const {
    detectKeychainAvailability,
    loadKeychainAdapter,
    KEYCHAIN_SERVICE,
    KEYCHAIN_ACCOUNT,
  } = await import('./keychain.js');

  const availability = await detectKeychainAvailability();
  if (!availability.available) {
    throw new Error(
      `OS keychain is not available: ${availability.reason}. Cannot retrieve key for migration.`,
    );
  }

  const adapter = await loadKeychainAdapter();
  if (!adapter) {
    throw new Error('Keychain adapter failed to load');
  }

  const rawKey = await adapter.retrieve(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  if (!rawKey) {
    throw new Error('No key found in keychain. Cannot migrate.');
  }

  const modeName: EncryptionModeName = mode ?? 'machine-bound';
  const encrypted = await encryptWithMode(rawKey, modeName, modeInput);

  const updatedWallet: WalletFile = {
    address: wallet.address,
    encryptedKey: encrypted.encryptedKey,
    keySalt: encrypted.keySalt,
    keyIv: encrypted.keyIv,
    networkId: wallet.networkId,
    encryptionMode: modeName,
    keyStorage: 'file',
  };
  writeJsonFile(WALLET_FILENAME, updatedWallet);

  // Verify: decrypt from file and compare
  const decrypted = await decryptWithMode(updatedWallet, modeInput);
  if (decrypted !== rawKey) {
    // Restore original wallet.json
    writeJsonFile(WALLET_FILENAME, wallet);
    throw new Error('File verification failed: decrypted key does not match original');
  }

  // Delete keychain entry
  await adapter.delete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);

  wipeString(rawKey);
  clearKeyCache();

  return {
    address: wallet.address,
    from: 'keychain',
    to: 'file',
    network: wallet.networkId,
  };
}

