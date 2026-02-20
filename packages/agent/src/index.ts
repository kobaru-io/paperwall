// -- Encryption Mode Abstraction ---

export type { EncryptionMode, EncryptionKey, EncryptedData } from './encryption-mode.js';
export {
  DeriveKeyError,
  EncryptionError,
  DecryptionError,
  AuthenticationError,
} from './encryption-mode.js';

// -- Key Derivation Engine ---

export { KeyDerivationEngine } from './key-derivation-engine.js';

// -- Encryption Modes (all 3 + detector) ---

export {
  MachineBindingMode,
  PasswordEncryptionMode,
  validatePasswordStrength,
  EnvInjectedEncryptionMode,
  decodeKeyMaterial,
  readKeyFromEnvironment,
  EncryptionModeDetector,
  UnknownEncryptionModeError,
} from './modes.js';
export type {
  PasswordStrengthResult,
  EncryptionModeName,
  WalletMetadata,
} from './modes.js';

// -- Key Wipe Utilities ---

export { wipeBuffer, wipeString } from './key-wipe.js';

// -- Existing Crypto ---

export type { EncryptedKey } from './crypto.js';
export { generatePrivateKey, getMachineIdentity, encryptKey, decryptKey } from './crypto.js';
