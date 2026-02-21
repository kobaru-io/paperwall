import type { EncryptionMode, EncryptionKey, EncryptedData } from '../encryption-mode.js';
import { DeriveKeyError } from '../encryption-mode.js';
import { KeyDerivationEngine } from '../key-derivation-engine.js';

// -- Types ---

/**
 * Result of password strength validation.
 */
export interface PasswordStrengthResult {
  readonly valid: boolean;
  readonly reason?: string;
}

// -- Constants ---

const MIN_PASSWORD_LENGTH = 8;

// -- Public API ---

/**
 * Validate password strength. Requires at least 8 characters.
 * No forced complexity rules (uppercase, numbers, symbols) — length is
 * the primary defense for PBKDF2-derived keys with 600k iterations.
 *
 * @param password - Password to validate
 * @returns Validation result with reason if invalid
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters. Longer passphrases are more secure than short complex passwords.`,
    };
  }

  return { valid: true };
}

// -- PasswordEncryptionMode ---

/**
 * Password-based encryption mode for interactive MCP users.
 * Delegates key derivation and encryption to KeyDerivationEngine (PBKDF2 + AES-256-GCM).
 * Adds password strength validation before derivation.
 */
export class PasswordEncryptionMode implements EncryptionMode {
  private readonly engine = new KeyDerivationEngine();

  /**
   * Derive an encryption key from a password string.
   *
   * @param salt - 32-byte random salt
   * @param input - Password string (Uint8Array rejected — use env-injected mode for raw bytes)
   * @throws DeriveKeyError if password is too weak or input is not a string
   */
  async deriveKey(salt: Uint8Array, input: string | Uint8Array): Promise<EncryptionKey> {
    if (input instanceof Uint8Array) {
      throw new DeriveKeyError('Password mode requires a string input, not raw bytes');
    }

    const strength = validatePasswordStrength(input);
    if (!strength.valid) {
      throw new DeriveKeyError(strength.reason ?? 'Password too weak');
    }

    return this.engine.deriveKey(salt, input);
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
