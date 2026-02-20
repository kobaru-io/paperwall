import * as crypto from 'node:crypto';
import * as os from 'node:os';

// -- Types ---

export interface EncryptedKey {
  readonly encryptedKey: string;
  readonly keySalt: string;
  readonly keyIv: string;
}

// -- Constants ---

const FIXED_SALT = 'paperwall-agent-machine-bound-v1';

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
  password?: string,
): Promise<EncryptedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derivedKey = await deriveKey(salt, password);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    encoder.encode(privateKey),
  );

  return {
    encryptedKey: Buffer.from(encrypted).toString('hex'),
    keySalt: Buffer.from(salt).toString('hex'),
    keyIv: Buffer.from(iv).toString('hex'),
  };
}

export async function decryptKey(
  encryptedKeyHex: string,
  keySaltHex: string,
  keyIvHex: string,
  password?: string,
): Promise<string> {
  const encryptedData = Buffer.from(encryptedKeyHex, 'hex');
  const salt = Buffer.from(keySaltHex, 'hex');
  const iv = Buffer.from(keyIvHex, 'hex');

  const derivedKey = await deriveKey(new Uint8Array(salt), password);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    derivedKey,
    new Uint8Array(encryptedData),
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// -- Internal Helpers ---

async function deriveKey(
  salt: Uint8Array,
  password?: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password ?? getMachineIdentity()),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: 600_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
