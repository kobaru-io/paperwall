// -- Types ---

/**
 * Branded CryptoKey type for AES-256-GCM encryption/decryption.
 * Ensures only keys derived through our engine are used.
 */
export type EncryptionKey = CryptoKey & { readonly __brand: 'EncryptionKey' };

/**
 * Output of encryption operation: ciphertext + metadata for decryption.
 */
export interface EncryptedData {
  readonly ciphertext: Uint8Array; // AES-GCM ciphertext
  readonly iv: Uint8Array; // 12-byte initialization vector (nonce)
  readonly authTag: Uint8Array; // 16-byte authentication tag (from AES-GCM)
}

/**
 * Abstract encryption mode interface. All modes (password, env-injected, machine-bound)
 * implement this contract. Enables pluggable encryption strategies.
 */
export interface EncryptionMode {
  /**
   * Derive a symmetric key from mode-specific input (password, env var, machine identity).
   *
   * @param salt - 32-byte random salt (prevents rainbow tables)
   * @param input - Mode-specific input: password string, env key, or machine identity
   * @returns Derived CryptoKey ready for AES-256-GCM
   * @throws DeriveKeyError if input is invalid or derivation fails
   */
  deriveKey(salt: Uint8Array, input: string | Uint8Array): Promise<EncryptionKey>;

  /**
   * Encrypt plaintext using derived key with AES-256-GCM.
   *
   * @param plaintext - Data to encrypt (typically private key hex)
   * @param key - CryptoKey from deriveKey()
   * @returns Ciphertext + IV + auth tag
   * @throws EncryptionError if encryption fails
   */
  encrypt(plaintext: Uint8Array, key: EncryptionKey): Promise<EncryptedData>;

  /**
   * Decrypt ciphertext using derived key with AES-256-GCM.
   *
   * @param encrypted - Output from encrypt()
   * @param key - CryptoKey from deriveKey()
   * @returns Original plaintext
   * @throws DecryptionError if decryption fails or tag is invalid
   */
  decrypt(encrypted: EncryptedData, key: EncryptionKey): Promise<Uint8Array>;
}

// -- Error Types ---

/**
 * Thrown when key derivation fails (invalid input, cryptographic error, etc.)
 */
export class DeriveKeyError extends Error {
  override readonly name = 'DeriveKeyError' as const;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Thrown when encryption operation fails.
 */
export class EncryptionError extends Error {
  override readonly name = 'EncryptionError' as const;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Thrown when decryption fails (wrong key, tampered ciphertext, invalid tag, etc.)
 */
export class DecryptionError extends Error {
  override readonly name: 'DecryptionError' | 'AuthenticationError' = 'DecryptionError' as const;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Thrown when decryption fails due to authentication tag mismatch (ciphertext tampered or wrong key).
 */
export class AuthenticationError extends DecryptionError {
  override readonly name = 'AuthenticationError' as const;

  constructor(message = 'Authentication tag verification failed') {
    super(message);
  }
}
