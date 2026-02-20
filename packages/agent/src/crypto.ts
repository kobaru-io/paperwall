import * as crypto from 'node:crypto';
import * as os from 'node:os';
import { KeyDerivationEngine } from './key-derivation-engine.js';

// -- Types ---

export interface EncryptedKey {
  readonly encryptedKey: string;
  readonly keySalt: string;
  readonly keyIv: string;
}

// -- Constants ---

const FIXED_SALT = 'paperwall-agent-machine-bound-v1';

// -- Internal ---

const engine = new KeyDerivationEngine();

// -- Public API ---

export function generatePrivateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('hex');
}

export function getMachineIdentity(): string {
  return `${os.hostname()}:${os.userInfo().uid}:${FIXED_SALT}`;
}

export async function encryptKey(
  privateKey: string,
): Promise<EncryptedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = new TextEncoder().encode(privateKey);

  const key = await engine.deriveKey(salt, getMachineIdentity());
  const encrypted = await engine.encrypt(plaintext, key);

  // Combine ciphertext + authTag for backward-compatible hex format
  const combined = new Uint8Array(encrypted.ciphertext.length + encrypted.authTag.length);
  combined.set(encrypted.ciphertext, 0);
  combined.set(encrypted.authTag, encrypted.ciphertext.length);

  return {
    encryptedKey: Buffer.from(combined).toString('hex'),
    keySalt: Buffer.from(salt).toString('hex'),
    keyIv: Buffer.from(encrypted.iv).toString('hex'),
  };
}

export async function decryptKey(
  encryptedKeyHex: string,
  keySaltHex: string,
  keyIvHex: string,
): Promise<string> {
  const encryptedData = Buffer.from(encryptedKeyHex, 'hex');
  const salt = new Uint8Array(Buffer.from(keySaltHex, 'hex'));
  const iv = new Uint8Array(Buffer.from(keyIvHex, 'hex'));

  // Split combined data into ciphertext + authTag (last 16 bytes)
  const AUTH_TAG_LENGTH = 16;
  const ciphertext = new Uint8Array(encryptedData.slice(0, encryptedData.length - AUTH_TAG_LENGTH));
  const authTag = new Uint8Array(encryptedData.slice(-AUTH_TAG_LENGTH));

  const key = await engine.deriveKey(salt, getMachineIdentity());
  const decrypted = await engine.decrypt({ ciphertext, iv, authTag }, key);

  return new TextDecoder().decode(decrypted);
}
