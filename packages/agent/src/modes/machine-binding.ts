import * as os from 'node:os';
import type { EncryptionMode, EncryptionKey, EncryptedData } from '../encryption-mode.js';
import { KeyDerivationEngine } from '../key-derivation-engine.js';

// -- Constants ---

export const FIXED_SALT = 'paperwall-agent-machine-bound-v1';

// -- Public API ---

/**
 * Build a deterministic machine identity string from hostname + uid + fixed salt.
 * Used as PBKDF2 input for machine-bound encryption.
 */
export function getMachineIdentity(): string {
  return `${os.hostname()}:${os.userInfo().uid}:${FIXED_SALT}`;
}

// -- MachineBindingMode ---

/**
 * Machine-bound encryption mode (legacy default).
 * Derives key from hostname + uid, making the wallet decryptable only on the
 * same machine by the same OS user. No password or env var needed.
 *
 * This wraps the existing machine-bound logic from crypto.ts into the
 * EncryptionMode interface for use with the new pluggable encryption system.
 */
export class MachineBindingMode implements EncryptionMode {
  private readonly engine = new KeyDerivationEngine();

  /**
   * Derive an encryption key from machine identity.
   * The `input` parameter is ignored — machine identity is always used.
   *
   * @param salt - 32-byte random salt
   * @param _input - Ignored (machine identity is derived internally)
   * @throws DeriveKeyError if salt is invalid or derivation fails
   */
  async deriveKey(salt: Uint8Array, _input: string | Uint8Array): Promise<EncryptionKey> {
    return this.engine.deriveKey(salt, getMachineIdentity());
  }

  /**
   * Encrypt plaintext using AES-256-GCM. Delegates to KeyDerivationEngine.
   */
  async encrypt(plaintext: Uint8Array, key: EncryptionKey): Promise<EncryptedData> {
    return this.engine.encrypt(plaintext, key);
  }

  /**
   * Decrypt ciphertext using AES-256-GCM. Delegates to KeyDerivationEngine.
   */
  async decrypt(encrypted: EncryptedData, key: EncryptionKey): Promise<Uint8Array> {
    return this.engine.decrypt(encrypted, key);
  }
}
