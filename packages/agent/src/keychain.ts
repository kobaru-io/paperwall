// -- Types ---

export interface KeychainAdapter {
  store(service: string, account: string, secret: string): Promise<void>;
  retrieve(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<boolean>;
}

export interface KeychainAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

// -- Error Types ---

export class KeychainError extends Error {
  override readonly name: string = 'KeychainError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class KeychainUnavailableError extends KeychainError {
  override readonly name = 'KeychainUnavailableError' as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class KeychainAccessError extends KeychainError {
  override readonly name = 'KeychainAccessError' as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

// -- Constants ---

export const KEYCHAIN_SERVICE = 'paperwall';
export const KEYCHAIN_ACCOUNT = 'wallet-private-key';

// -- Internal Helpers ---

let cachedAdapter: KeychainAdapter | null | undefined;
let cachedAvailability: KeychainAvailability | undefined;

// -- Public API ---

/**
 * Dynamically load the @napi-rs/keyring module and return a KeychainAdapter
 * wrapping its Entry class. Returns null if the native addon is not installed.
 *
 * The result is cached after the first successful call.
 */
export async function loadKeychainAdapter(): Promise<KeychainAdapter | null> {
  if (cachedAdapter !== undefined) {
    return cachedAdapter;
  }

  try {
    const keyring = await import('@napi-rs/keyring') as {
      readonly Entry: new (service: string, account: string) => {
        setPassword(password: string): void;
        getPassword(): string;
        deletePassword(): void;
      };
    };

    const adapter: KeychainAdapter = {
      async store(service: string, account: string, secret: string): Promise<void> {
        try {
          const entry = new keyring.Entry(service, account);
          entry.setPassword(secret);
        } catch (error: unknown) {
          throw new KeychainAccessError('Failed to store secret in keychain', {
            cause: error,
          });
        }
      },

      async retrieve(service: string, account: string): Promise<string | null> {
        try {
          const entry = new keyring.Entry(service, account);
          return entry.getPassword();
        } catch {
          return null;
        }
      },

      async delete(service: string, account: string): Promise<boolean> {
        try {
          const entry = new keyring.Entry(service, account);
          entry.deletePassword();
          return true;
        } catch {
          return false;
        }
      },
    };

    cachedAdapter = adapter;
    return adapter;
  } catch {
    cachedAdapter = null;
    return null;
  }
}

/**
 * Reset the cached adapter (for testing).
 */
export function resetKeychainAdapterCache(): void {
  cachedAdapter = undefined;
}

/**
 * Detect whether the OS keychain is available and functional.
 *
 * Checks:
 * 1. Whether the native addon is installed
 * 2. On Linux, whether D-Bus session bus is available
 * 3. Probes the keychain with a test store + delete
 *
 * The result is memoized after the first call.
 */
export async function detectKeychainAvailability(): Promise<KeychainAvailability> {
  if (cachedAvailability !== undefined) {
    return cachedAvailability;
  }

  const adapter = await loadKeychainAdapter();

  if (adapter === null) {
    cachedAvailability = {
      available: false,
      reason: 'Native keychain addon not installed',
    };
    return cachedAvailability;
  }

  if (process.platform === 'linux' && !process.env['DBUS_SESSION_BUS_ADDRESS']) {
    cachedAvailability = {
      available: false,
      reason: 'D-Bus session bus not available (required for Secret Service on Linux)',
    };
    return cachedAvailability;
  }

  // Probe: store + delete a test entry
  const probeService = 'paperwall-probe';
  const probeAccount = 'availability-test';
  try {
    await adapter.store(probeService, probeAccount, 'probe');
    await adapter.delete(probeService, probeAccount);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    cachedAvailability = {
      available: false,
      reason: `Keychain probe failed: ${message}`,
    };
    return cachedAvailability;
  }

  cachedAvailability = { available: true };
  return cachedAvailability;
}

/**
 * Reset the cached availability result (for testing).
 */
export function resetKeychainAvailabilityCache(): void {
  cachedAvailability = undefined;
}
