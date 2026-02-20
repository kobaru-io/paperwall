import type { EncryptionMode, EncryptionKey, EncryptedData } from '../encryption-mode.js';
import { DeriveKeyError } from '../encryption-mode.js';
import { KeyDerivationEngine } from '../key-derivation-engine.js';

// -- Constants ---

const ENV_VAR_NAME = 'PAPERWALL_WALLET_KEY';
const EXPECTED_KEY_LENGTH = 32; // bytes (256 bits for AES-256)

// -- Public API ---

/**
 * Decode and validate a base64-encoded key string.
 * Strict parsing: no whitespace tolerance, must decode to exactly 32 bytes.
 *
 * @param encoded - Base64-encoded key material
 * @returns Decoded 32-byte Uint8Array
 * @throws DeriveKeyError if base64 is invalid or decoded length is not 32 bytes
 */
export function decodeKeyMaterial(encoded: string): Uint8Array {
  if (encoded.length === 0) {
    throw new DeriveKeyError(
      `${ENV_VAR_NAME} is empty. Generate a key with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`,
    );
  }

  // Reject whitespace (strict parsing)
  if (/\s/.test(encoded)) {
    throw new DeriveKeyError(
      `${ENV_VAR_NAME} contains whitespace. The value must be a clean base64 string with no spaces or newlines.`,
    );
  }

  // Validate base64 characters
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new DeriveKeyError(
      `${ENV_VAR_NAME} is not valid base64. Generate a key with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`,
    );
  }

  // Regex above validates base64 characters, so Buffer.from won't throw
  // (Node's Buffer.from with 'base64' encoding is lenient by design).
  const decoded = Buffer.from(encoded, 'base64');

  if (decoded.length !== EXPECTED_KEY_LENGTH) {
    throw new DeriveKeyError(
      `${ENV_VAR_NAME} must decode to exactly ${EXPECTED_KEY_LENGTH} bytes, got ${decoded.length}. Generate a key with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`,
    );
  }

  return new Uint8Array(decoded);
}

/**
 * Read and validate the PAPERWALL_WALLET_KEY environment variable.
 *
 * @returns Base64-encoded key string
 * @throws DeriveKeyError if env var is missing or empty
 */
export function readKeyFromEnvironment(): string {
  const value = process.env[ENV_VAR_NAME];

  if (value === undefined || value === '') {
    throw new DeriveKeyError(
      `Environment variable ${ENV_VAR_NAME} is not set. ` +
      `For container deployments, set it to a base64-encoded 32-byte key.\n` +
      `Generate one with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`,
    );
  }

  return value;
}

// -- EnvInjectedEncryptionMode ---

/**
 * Environment-injected encryption mode for A2A server / container deployments.
 * Reads a pre-generated 32-byte key from the PAPERWALL_WALLET_KEY environment variable
 * (base64-encoded), then uses PBKDF2 + AES-256-GCM via KeyDerivationEngine.
 *
 * This mode is designed for headless, automated environments where interactive
 * password entry is not possible (Docker, Kubernetes, CI/CD).
 */
export class EnvInjectedEncryptionMode implements EncryptionMode {
  private readonly engine = new KeyDerivationEngine();

  /**
   * Derive an encryption key from the PAPERWALL_WALLET_KEY environment variable.
   * Reads the env var, base64-decodes it, validates length, then derives via PBKDF2.
   *
   * @param salt - 32-byte random salt
   * @param input - Ignored (key material comes from environment). Pass empty Uint8Array.
   * @throws DeriveKeyError if env var is missing, invalid base64, or wrong length
   */
  async deriveKey(salt: Uint8Array, _input: string | Uint8Array): Promise<EncryptionKey> {
    const encoded = readKeyFromEnvironment();
    const keyBytes = decodeKeyMaterial(encoded);

    return this.engine.deriveKey(salt, keyBytes);
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
