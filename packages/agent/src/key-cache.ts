import { wipeString } from './key-wipe.js';

// -- KeyCache ---

/**
 * Process-lifetime cache for resolved private keys.
 * Resolves once, caches for the duration of the process.
 * Errors are NOT cached — retries after failure.
 * Deduplicates concurrent resolve calls (returns same promise).
 */
export class KeyCache {
  private cachedKey: `0x${string}` | null = null;
  private pending: Promise<`0x${string}`> | null = null;
  private exitHandlerRegistered = false;

  async getOrResolve(resolver: () => Promise<`0x${string}`>): Promise<`0x${string}`> {
    if (this.cachedKey !== null) {
      return this.cachedKey;
    }
    if (this.pending !== null) {
      return this.pending;
    }
    this.pending = resolver().then((key) => {
      this.cachedKey = key;
      this.pending = null;
      return key;
    }).catch((err: unknown) => {
      this.pending = null;
      throw err;
    });
    return this.pending;
  }

  clear(): void {
    if (this.cachedKey !== null) {
      wipeString(this.cachedKey);
    }
    this.cachedKey = null;
    this.pending = null;
  }

  registerExitHandler(): void {
    if (this.exitHandlerRegistered) {
      return;
    }
    const handler = () => { this.clear(); };
    process.on('exit', handler);
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    this.exitHandlerRegistered = true;
  }
}
