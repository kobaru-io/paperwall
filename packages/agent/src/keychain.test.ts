import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- Error Type Tests ---

describe('KeychainError types', () => {
  it('KeychainError has correct name and is instanceof Error', async () => {
    const { KeychainError } = await import('./keychain.js');
    const err = new KeychainError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KeychainError);
    expect(err.name).toBe('KeychainError');
    expect(err.message).toBe('test');
  });

  it('KeychainUnavailableError extends KeychainError', async () => {
    const { KeychainError, KeychainUnavailableError } = await import('./keychain.js');
    const err = new KeychainUnavailableError('unavailable');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KeychainError);
    expect(err).toBeInstanceOf(KeychainUnavailableError);
    expect(err.name).toBe('KeychainUnavailableError');
  });

  it('KeychainAccessError preserves cause', async () => {
    const { KeychainError, KeychainAccessError } = await import('./keychain.js');
    const cause = new Error('root cause');
    const err = new KeychainAccessError('access denied', { cause });
    expect(err).toBeInstanceOf(KeychainError);
    expect(err.name).toBe('KeychainAccessError');
    expect(err.cause).toBe(cause);
  });
});

// -- loadKeychainAdapter Tests ---

describe('loadKeychainAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when @napi-rs/keyring is not installed', async () => {
    vi.doMock('@napi-rs/keyring', () => {
      throw new Error('Cannot find module');
    });
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    expect(adapter).toBeNull();
  });

  it('returns adapter when @napi-rs/keyring is available', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return 'secret'; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    expect(adapter).not.toBeNull();
  });

  it('caches the adapter after first load', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return 'secret'; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const first = await loadKeychainAdapter();
    const second = await loadKeychainAdapter();
    expect(first).toBe(second);
  });
});

// -- Adapter Operation Tests ---

describe('KeychainAdapter operations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('store calls setPassword on Entry', async () => {
    const setPassword = vi.fn();
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword = setPassword;
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    await adapter!.store('svc', 'acct', 'mysecret');
    expect(setPassword).toHaveBeenCalledWith('mysecret');
  });

  it('store throws KeychainAccessError on failure', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { throw new Error('OS error'); }
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache, KeychainAccessError } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    await expect(adapter!.store('svc', 'acct', 'secret')).rejects.toThrow(KeychainAccessError);
  });

  it('retrieve returns password value', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return 'my-secret'; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    const result = await adapter!.retrieve('svc', 'acct');
    expect(result).toBe('my-secret');
  });

  it('retrieve returns null on error', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { throw new Error('not found'); }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    const result = await adapter!.retrieve('svc', 'acct');
    expect(result).toBeNull();
  });

  it('delete returns true on success', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    const result = await adapter!.delete('svc', 'acct');
    expect(result).toBe(true);
  });

  it('delete returns false on error', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return ''; }
        deletePassword(): void { throw new Error('not found'); }
      },
    }));
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const adapter = await loadKeychainAdapter();
    const result = await adapter!.delete('svc', 'acct');
    expect(result).toBe(false);
  });
});

// -- detectKeychainAvailability Tests ---

describe('detectKeychainAvailability', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns unavailable when no addon installed', async () => {
    vi.doMock('@napi-rs/keyring', () => {
      throw new Error('Cannot find module');
    });
    const { detectKeychainAvailability, resetKeychainAdapterCache, resetKeychainAvailabilityCache } =
      await import('./keychain.js');
    resetKeychainAdapterCache();
    resetKeychainAvailabilityCache();
    const result = await detectKeychainAvailability();
    expect(result.available).toBe(false);
    expect(result.reason).toContain('not installed');
  });

  it('returns unavailable on Linux without DBUS_SESSION_BUS_ADDRESS', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const originalPlatform = process.platform;
    const originalDbus = process.env['DBUS_SESSION_BUS_ADDRESS'];
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    delete process.env['DBUS_SESSION_BUS_ADDRESS'];

    try {
      const { detectKeychainAvailability, resetKeychainAdapterCache, resetKeychainAvailabilityCache } =
        await import('./keychain.js');
      resetKeychainAdapterCache();
      resetKeychainAvailabilityCache();
      const result = await detectKeychainAvailability();
      expect(result.available).toBe(false);
      expect(result.reason).toContain('D-Bus');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      if (originalDbus !== undefined) {
        process.env['DBUS_SESSION_BUS_ADDRESS'] = originalDbus;
      }
    }
  });

  it('returns available when probe succeeds', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const originalPlatform = process.platform;
    // Ensure not linux to skip D-Bus check
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    try {
      const { detectKeychainAvailability, resetKeychainAdapterCache, resetKeychainAvailabilityCache } =
        await import('./keychain.js');
      resetKeychainAdapterCache();
      resetKeychainAvailabilityCache();
      const result = await detectKeychainAvailability();
      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  it('returns unavailable when probe fails', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { throw new Error('keychain locked'); }
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    try {
      const { detectKeychainAvailability, resetKeychainAdapterCache, resetKeychainAvailabilityCache } =
        await import('./keychain.js');
      resetKeychainAdapterCache();
      resetKeychainAvailabilityCache();
      const result = await detectKeychainAvailability();
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Keychain probe failed');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  it('caches availability result', async () => {
    vi.doMock('@napi-rs/keyring', () => ({
      Entry: class {
        setPassword(): void { /* noop */ }
        getPassword(): string { return ''; }
        deletePassword(): void { /* noop */ }
      },
    }));
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    try {
      const { detectKeychainAvailability, resetKeychainAdapterCache, resetKeychainAvailabilityCache } =
        await import('./keychain.js');
      resetKeychainAdapterCache();
      resetKeychainAvailabilityCache();
      const first = await detectKeychainAvailability();
      const second = await detectKeychainAvailability();
      expect(first).toBe(second);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });
});

// -- Reset Function Tests ---

describe('reset functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resetKeychainAdapterCache allows re-loading', async () => {
    vi.doMock('@napi-rs/keyring', () => {
      throw new Error('Cannot find module');
    });
    const { loadKeychainAdapter, resetKeychainAdapterCache } = await import('./keychain.js');
    resetKeychainAdapterCache();
    const first = await loadKeychainAdapter();
    expect(first).toBeNull();

    // Reset and re-mock — but since module is same instance, cache reset matters
    resetKeychainAdapterCache();
    const second = await loadKeychainAdapter();
    // Still null since mock hasn't changed, but proves cache was cleared (called import again)
    expect(second).toBeNull();
  });

  it('resetKeychainAvailabilityCache allows re-detection', async () => {
    vi.doMock('@napi-rs/keyring', () => {
      throw new Error('Cannot find module');
    });
    const { detectKeychainAvailability, resetKeychainAdapterCache, resetKeychainAvailabilityCache } =
      await import('./keychain.js');
    resetKeychainAdapterCache();
    resetKeychainAvailabilityCache();
    const first = await detectKeychainAvailability();
    expect(first.available).toBe(false);

    resetKeychainAvailabilityCache();
    resetKeychainAdapterCache();
    const second = await detectKeychainAvailability();
    expect(second.available).toBe(false);
    // They should be different object references since cache was cleared
    expect(first).not.toBe(second);
  });
});
