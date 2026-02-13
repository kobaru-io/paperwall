import { privateKeyToAccount } from 'viem/accounts';

export interface KeyPair {
  readonly privateKey: string;
  readonly address: string;
}

export interface EncryptedKeyData {
  readonly encryptedKey: string;
  readonly keySalt: string;
  readonly keyIv: string;
}

// ── Key Generation ──────────────────────────────────────────────────

export function generateKeyPair(): KeyPair {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const privateKey = `0x${bytesToHex(bytes)}`;
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return { privateKey, address: account.address };
}

// ── Encryption / Decryption (PBKDF2 + AES-256-GCM) ─────────────────

const PBKDF2_ITERATIONS = 600_000;

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptKey(
  password: string,
  privateKey: string,
): Promise<EncryptedKeyData> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derivedKey = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    encoder.encode(privateKey),
  );

  return {
    encryptedKey: bytesToHex(new Uint8Array(encrypted)),
    keySalt: bytesToHex(salt),
    keyIv: bytesToHex(iv),
  };
}

export async function decryptKey(
  password: string,
  encryptedKeyHex: string,
  keySaltHex: string,
  keyIvHex: string,
): Promise<string> {
  const encryptedData = hexToBytes(encryptedKeyHex);
  const salt = hexToBytes(keySaltHex);
  const iv = hexToBytes(keyIvHex);

  const derivedKey = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    derivedKey,
    encryptedData.buffer as ArrayBuffer,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// ── Hex Helpers ─────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
