import * as path from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey, encryptKey, decryptKey } from './crypto.js';
import {
  getConfigDir,
  readJsonFile,
  writeJsonFile,
} from './storage.js';
import { getNetwork } from './networks.js';

const DEFAULT_NETWORK = 'eip155:324705682';
const WALLET_FILENAME = 'wallet.json';

export interface WalletInfo {
  readonly address: string;
  readonly network: string;
  readonly storagePath: string;
}

export interface WalletFile {
  readonly address: string;
  readonly encryptedKey: string;
  readonly keySalt: string;
  readonly keyIv: string;
  readonly networkId: string;
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
}

export async function createWallet(
  networkOrOptions?: string | CreateWalletOptions,
): Promise<WalletInfo> {
  const opts = typeof networkOrOptions === 'string'
    ? { network: networkOrOptions }
    : networkOrOptions ?? {};
  const networkId = opts.network ?? DEFAULT_NETWORK;
  // Validate network is known (throws if unsupported)
  getNetwork(networkId);

  if (!opts.force) {
    assertNoExistingWallet();
  }

  const rawKey = generatePrivateKey();
  const hexKey = `0x${rawKey}` as `0x${string}`;
  const account = privateKeyToAccount(hexKey);
  const encrypted = await encryptKey(rawKey);

  const walletData: WalletFile = {
    address: account.address,
    encryptedKey: encrypted.encryptedKey,
    keySalt: encrypted.keySalt,
    keyIv: encrypted.keyIv,
    networkId,
  };

  writeJsonFile(WALLET_FILENAME, walletData);

  const storagePath = path.join(getConfigDir(), WALLET_FILENAME);

  return {
    address: account.address,
    network: networkId,
    storagePath,
  };
}

export interface ImportWalletOptions {
  readonly network?: string;
  readonly force?: boolean;
}

export async function importWallet(
  privateKeyHex: string,
  networkOrOptions?: string | ImportWalletOptions,
): Promise<WalletInfo> {
  const opts = typeof networkOrOptions === 'string'
    ? { network: networkOrOptions }
    : networkOrOptions ?? {};
  const networkId = opts.network ?? DEFAULT_NETWORK;
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
  const encrypted = await encryptKey(rawKey);

  const walletData: WalletFile = {
    address: account.address,
    encryptedKey: encrypted.encryptedKey,
    keySalt: encrypted.keySalt,
    keyIv: encrypted.keyIv,
    networkId,
  };

  writeJsonFile(WALLET_FILENAME, walletData);

  const storagePath = path.join(getConfigDir(), WALLET_FILENAME);

  return {
    address: account.address,
    network: networkId,
    storagePath,
  };
}

// -- Internal Helpers ---

function assertNoExistingWallet(): void {
  const existing = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (existing) {
    throw new Error(
      `Wallet already exists (address: ${existing.address}). Use --force to overwrite.`,
    );
  }
}

export async function getAddress(): Promise<string> {
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (!wallet) {
    throw new Error('No wallet configured. Run: paperwall wallet create');
  }
  return wallet.address;
}

export async function resolvePrivateKey(): Promise<`0x${string}`> {
  // Priority 1: PAPERWALL_PRIVATE_KEY env var
  const envKey = process.env['PAPERWALL_PRIVATE_KEY'];
  if (envKey) {
    return envKey as `0x${string}`;
  }

  // Priority 2: Machine-bound encrypted wallet file
  const wallet = readJsonFile<WalletFile>(WALLET_FILENAME);
  if (wallet) {
    const rawKey = await decryptKey(
      wallet.encryptedKey,
      wallet.keySalt,
      wallet.keyIv,
    );
    return `0x${rawKey}`;
  }

  throw new Error(
    'No wallet configured. Run: paperwall wallet create',
  );
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
