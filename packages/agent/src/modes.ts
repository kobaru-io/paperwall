// -- Encryption Modes (barrel export) ---

// Machine-bound (legacy default)
export { MachineBindingMode, getMachineIdentity, FIXED_SALT } from './modes/machine-binding.js';

// Password-based (interactive MCP)
export { PasswordEncryptionMode, validatePasswordStrength } from './modes/password.js';
export type { PasswordStrengthResult } from './modes/password.js';

// Environment-injected (container/CI)
export { EnvInjectedEncryptionMode, decodeKeyMaterial, readKeyFromEnvironment } from './modes/env-injected.js';

// Mode detection
export {
  EncryptionModeDetector,
  UnknownEncryptionModeError,
} from './modes/detector.js';
export type { EncryptionModeName, WalletMetadata } from './modes/detector.js';
