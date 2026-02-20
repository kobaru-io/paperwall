import type { EncryptionMode } from '../encryption-mode.js';
import { MachineBindingMode } from './machine-binding.js';
import { PasswordEncryptionMode } from './password.js';
import { EnvInjectedEncryptionMode } from './env-injected.js';

// -- Types ---

/**
 * Valid encryption mode names stored in wallet metadata.
 */
export type EncryptionModeName = 'password' | 'env-injected' | 'machine-bound';

/**
 * Wallet metadata used for mode detection. Extracted from wallet file.
 */
export interface WalletMetadata {
  readonly encryptionMode?: EncryptionModeName | undefined;
}

// -- Error Types ---

/**
 * Thrown when wallet contains an unrecognized encryption mode.
 */
export class UnknownEncryptionModeError extends Error {
  override readonly name = 'UnknownEncryptionModeError' as const;

  constructor(readonly mode: string) {
    super(
      `Unknown encryption mode: "${mode}". Valid modes: password, env-injected, machine-bound`,
    );
  }
}

// -- Constants ---

const VALID_MODES: ReadonlySet<string> = new Set<string>([
  'password',
  'env-injected',
  'machine-bound',
]);

// -- EncryptionModeDetector ---

/**
 * Detects and resolves the appropriate EncryptionMode implementation
 * based on wallet metadata. Handles legacy wallets (no metadata field)
 * by falling back to machine-bound mode.
 */
export class EncryptionModeDetector {
  /**
   * Detect encryption mode from wallet metadata.
   * Missing or undefined encryptionMode = legacy wallet = machine-bound.
   *
   * @param metadata - Wallet metadata (may be partial/legacy)
   * @returns Detected mode name
   * @throws UnknownEncryptionModeError if mode is set but not recognized
   */
  detectMode(metadata: WalletMetadata): EncryptionModeName {
    const { encryptionMode } = metadata;

    // Legacy wallets have no encryptionMode field
    if (encryptionMode === undefined) {
      return 'machine-bound';
    }

    if (!VALID_MODES.has(encryptionMode)) {
      throw new UnknownEncryptionModeError(encryptionMode);
    }

    return encryptionMode;
  }

  /**
   * Resolve a mode name to its EncryptionMode implementation.
   *
   * @param modeName - One of: password, env-injected, machine-bound
   * @returns EncryptionMode implementation
   * @throws UnknownEncryptionModeError if mode name is not recognized
   */
  resolveMode(modeName: EncryptionModeName): EncryptionMode {
    switch (modeName) {
      case 'machine-bound':
        return new MachineBindingMode();
      case 'password':
        return new PasswordEncryptionMode();
      case 'env-injected':
        return new EnvInjectedEncryptionMode();
      default:
        throw new UnknownEncryptionModeError(modeName as string);
    }
  }

  /**
   * Convenience: detect mode from metadata and return the implementation.
   *
   * @param metadata - Wallet metadata
   * @returns EncryptionMode implementation for the detected mode
   */
  detectAndResolve(metadata: WalletMetadata): EncryptionMode {
    const modeName = this.detectMode(metadata);
    return this.resolveMode(modeName);
  }

  /**
   * Type guard: check if a string is a valid encryption mode name.
   */
  static isValidMode(value: string): value is EncryptionModeName {
    return VALID_MODES.has(value);
  }
}
