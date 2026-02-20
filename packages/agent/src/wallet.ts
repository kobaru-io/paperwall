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
import { wipeBuffer } from './key-wipe.js';
import {
  getConfigDir,
  readJsonFile,
  writeJsonFile,
} from './storage.js';
import { getNetwork } from './networks.js';

// -- Constants ---

const DEFAULT_NETWORK = 'eip155:324705682';
const WALLET_FILENAME = 'wallet.json';

// -- Types ---

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
}

export interface ImportWalletOptions {
  readonly network?: string;
  readonly force?: boolean;
  readonly mode?: EncryptionModeName;
  readonly modeInput?: string;
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
  const rawKey = privateKeyHex.startsWith('0x')
    ? privateKeyHex.slice(2)
    : privateKeyHex;

  // Validate: must be exactly 64 hex characters
  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error(
      'Invalid private key: must be 64 hex characters (with optional 0x prefix)',
    );
  }

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

export async function getAddress(): Promise<string> {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error('No wallet configured. Run: paperwall wallet create');
  }
  return wallet.address;
}

/**
 * Resolve the private key for signing transactions.
 *
 * Priority:
 * 1. PAPERWALL_PRIVATE_KEY env var (direct, no decryption)
 * 2. Encrypted wallet file (auto-detects encryption mode)
 *
 * @param modeInput - Mode-specific input (password for password mode). Not needed for machine-bound or env-injected.
 */
export async function resolvePrivateKey(modeInput?: string): Promise<`0x${string}`> {
  // Priority 1: PAPERWALL_PRIVATE_KEY env var
  const envKey = process.env['PAPERWALL_PRIVATE_KEY'];
  if (envKey) {
    validatePrivateKeyFormat(envKey);
    return envKey as `0x${string}`;
  }

  // Priority 2: Encrypted wallet file with auto-detection
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (wallet) {
    const rawKey = await decryptWithMode(wallet, modeInput);
    return `0x${rawKey}`;
  }

  throw new Error(
    'No wallet configured. Run: paperwall wallet create',
  );
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
  const balanceFormatted = formatUsdc(balance);

  return {
    address: wallet.address,
    balance: balance.toString(),
    balanceFormatted,
    asset: 'USDC',
    network: networkId,
  };
}

function formatUsdc(smallestUnit: bigint): string {
  const divisor = 1_000_000n;
  const whole = smallestUnit / divisor;
  const remainder = smallestUnit % divisor;
  const decimal = remainder.toString().padStart(6, '0').replace(/0+$/, '') || '0';
  return `${whole}.${decimal.length < 2 ? decimal.padEnd(2, '0') : decimal}`;
}
