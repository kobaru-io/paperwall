import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EncryptionModeDetector,
  type EncryptionModeName,
  type WalletMetadata,
  UnknownEncryptionModeError,
} from './detector.js';
import { MachineBindingMode } from './machine-binding.js';
import { PasswordEncryptionMode } from './password.js';
import { EnvInjectedEncryptionMode } from './env-injected.js';

describe('EncryptionModeDetector', () => {
  const detector = new EncryptionModeDetector();

  // -- detectMode ---

  describe('detectMode', () => {
    it('should return "machine-bound" for wallet with no encryptionMode field', () => {
      const metadata: WalletMetadata = {};
      expect(detector.detectMode(metadata)).toBe('machine-bound');
    });

    it('should return "machine-bound" for wallet with encryptionMode: "machine-bound"', () => {
      const metadata: WalletMetadata = { encryptionMode: 'machine-bound' };
      expect(detector.detectMode(metadata)).toBe('machine-bound');
    });

    it('should return "password" for wallet with encryptionMode: "password"', () => {
      const metadata: WalletMetadata = { encryptionMode: 'password' };
      expect(detector.detectMode(metadata)).toBe('password');
    });

    it('should return "env-injected" for wallet with encryptionMode: "env-injected"', () => {
      const metadata: WalletMetadata = { encryptionMode: 'env-injected' };
      expect(detector.detectMode(metadata)).toBe('env-injected');
    });

    it('should throw UnknownEncryptionModeError for unknown mode', () => {
      const metadata = { encryptionMode: 'quantum-entangled' } as unknown as WalletMetadata;
      expect(() => detector.detectMode(metadata)).toThrow(UnknownEncryptionModeError);
      expect(() => detector.detectMode(metadata)).toThrow('quantum-entangled');
    });

    it('should handle undefined encryptionMode as legacy (machine-bound)', () => {
      const metadata: WalletMetadata = { encryptionMode: undefined };
      expect(detector.detectMode(metadata)).toBe('machine-bound');
    });
  });

  // -- resolveMode ---

  describe('resolveMode', () => {
    it('should return MachineBindingMode for "machine-bound"', () => {
      const mode = detector.resolveMode('machine-bound');
      expect(mode).toBeInstanceOf(MachineBindingMode);
    });

    it('should return PasswordEncryptionMode for "password"', () => {
      const mode = detector.resolveMode('password');
      expect(mode).toBeInstanceOf(PasswordEncryptionMode);
    });

    it('should return EnvInjectedEncryptionMode for "env-injected"', () => {
      const mode = detector.resolveMode('env-injected');
      expect(mode).toBeInstanceOf(EnvInjectedEncryptionMode);
    });

    it('should throw UnknownEncryptionModeError for unknown mode name', () => {
      expect(() => detector.resolveMode('bad' as EncryptionModeName)).toThrow(
        UnknownEncryptionModeError,
      );
    });
  });

  // -- detectAndResolve (convenience) ---

  describe('detectAndResolve', () => {
    it('should return MachineBindingMode for legacy wallet (no metadata)', () => {
      const mode = detector.detectAndResolve({});
      expect(mode).toBeInstanceOf(MachineBindingMode);
    });

    it('should return PasswordEncryptionMode for password wallet', () => {
      const mode = detector.detectAndResolve({ encryptionMode: 'password' });
      expect(mode).toBeInstanceOf(PasswordEncryptionMode);
    });

    it('should return EnvInjectedEncryptionMode for env-injected wallet', () => {
      const mode = detector.detectAndResolve({ encryptionMode: 'env-injected' });
      expect(mode).toBeInstanceOf(EnvInjectedEncryptionMode);
    });

    it('should return MachineBindingMode for machine-bound wallet', () => {
      const mode = detector.detectAndResolve({ encryptionMode: 'machine-bound' });
      expect(mode).toBeInstanceOf(MachineBindingMode);
    });
  });

  // -- isValidMode ---

  describe('isValidMode', () => {
    it('should return true for "password"', () => {
      expect(EncryptionModeDetector.isValidMode('password')).toBe(true);
    });

    it('should return true for "env-injected"', () => {
      expect(EncryptionModeDetector.isValidMode('env-injected')).toBe(true);
    });

    it('should return true for "machine-bound"', () => {
      expect(EncryptionModeDetector.isValidMode('machine-bound')).toBe(true);
    });

    it('should return false for unknown string', () => {
      expect(EncryptionModeDetector.isValidMode('quantum')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(EncryptionModeDetector.isValidMode('')).toBe(false);
    });
  });
});
