import * as crypto from 'node:crypto';
import type { EncryptionMode, EncryptionKey, EncryptedData } from './encryption-mode.js';
import {
  DeriveKeyError,
  EncryptionError,
  AuthenticationError,
} from './encryption-mode.js';

// -- Constants ---

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (AES-GCM nonce)
const AUTH_TAG_LENGTH = 16; // bytes (AES-GCM auth tag)

// -- KeyDerivationEngine ---

/**
 * Shared PBKDF2 key derivation and AES-256-GCM encryption/decryption engine.
 * Used by all encryption modes (password, env-injected, machine-bound).
 */
export class KeyDerivationEngine implements EncryptionMode {
  /**
   * Derive a symmetric key using PBKDF2 (600k iterations, SHA-256).
   *
   * @param salt - 32-byte random salt
   * @param input - Password string or raw key bytes
   * @throws DeriveKeyError if salt is invalid or derivation fails
   */
  async deriveKey(salt: Uint8Array, input: string | Uint8Array): Promise<EncryptionKey> {
    // Validate salt
    if (salt.length !== 32) {
      throw new DeriveKeyError('salt must be exactly 32 bytes');
    }

    // Convert input to Uint8Array
    let inputBytes: Uint8Array;
    if (typeof input === 'string') {
      if (input.length === 0) {
        throw new DeriveKeyError('password must not be empty');
      }
      inputBytes = new TextEncoder().encode(input);
    } else {
      inputBytes = input;
    }

    try {
      // Import key material for PBKDF2
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        inputBytes as unknown as ArrayBuffer,
        'PBKDF2',
        false,
        ['deriveKey'],
      );

      // Derive key using PBKDF2
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt as unknown as ArrayBuffer,
          iterations: PBKDF2_ITERATIONS,
          hash: PBKDF2_HASH,
        },
        keyMaterial,
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        false, // not extractable
        ['encrypt', 'decrypt'],
      );

      return derivedKey as unknown as EncryptionKey;
    } catch (cause) {
      if (cause instanceof DeriveKeyError) {
        throw cause;
      }
      throw new DeriveKeyError('Failed to derive key', cause);
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM with derived key.
   *
   * @param plaintext - Data to encrypt
   * @param key - CryptoKey from deriveKey()
   * @returns Ciphertext, IV, and authentication tag
   */
  async encrypt(plaintext: Uint8Array, key: EncryptionKey): Promise<EncryptedData> {
    try {
      // Generate random IV for this encryption
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

      // Encrypt using AES-256-GCM
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key as unknown as CryptoKey,
        plaintext as unknown as ArrayBuffer,
      );

      // AES-GCM in Web Crypto API appends auth tag to ciphertext
      // Last 16 bytes are the auth tag
      const ciphertextArray = new Uint8Array(ciphertext);
      const actualCiphertext = ciphertextArray.slice(0, ciphertextArray.length - AUTH_TAG_LENGTH);
      const authTag = ciphertextArray.slice(-AUTH_TAG_LENGTH);

      return {
        ciphertext: actualCiphertext,
        iv,
        authTag,
      };
    } catch (cause) {
      throw new EncryptionError('Failed to encrypt data', cause);
    }
  }

  /**
   * Decrypt ciphertext using AES-256-GCM with derived key.
   *
   * @param encrypted - Output from encrypt()
   * @param key - CryptoKey from deriveKey()
   * @returns Original plaintext
   * @throws AuthenticationError if tag verification fails
   */
  async decrypt(encrypted: EncryptedData, key: EncryptionKey): Promise<Uint8Array> {
    try {
      // Reconstruct ciphertext + auth tag (Web Crypto API expects combined)
      const ciphertextWithTag = new Uint8Array(
        encrypted.ciphertext.length + encrypted.authTag.length,
      );
      ciphertextWithTag.set(encrypted.ciphertext, 0);
      ciphertextWithTag.set(encrypted.authTag, encrypted.ciphertext.length);

      // Decrypt using AES-256-GCM
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: encrypted.iv as unknown as ArrayBuffer },
        key as unknown as CryptoKey,
        ciphertextWithTag,
      );

      return new Uint8Array(plaintext);
    } catch {
      throw new AuthenticationError(
        'Decryption failed: invalid authentication tag or wrong key',
      );
    }
  }
}
