// -- Types ---

/**
 * Function that prompts for and returns a password string.
 */
export type PasswordPromptFn = (address: string) => Promise<string>;

// -- SessionPasswordCache ---

/**
 * In-memory password cache for a single CLI session.
 * Stores passwords keyed by wallet address to avoid re-prompting
 * within the same command invocation.
 *
 * Auto-clears on process exit to prevent passwords from lingering.
 */
export class SessionPasswordCache {
  private readonly cache = new Map<string, string>();
  private exitHandlerRegistered = false;

  /**
   * Get a cached password for the given address, or prompt for one.
   *
   * @param address - Wallet address (case-normalized to lowercase)
   * @param promptFn - Function to call if password is not cached
   * @returns The password (from cache or freshly prompted)
   */
  async getOrPrompt(address: string, promptFn: PasswordPromptFn): Promise<string> {
    const key = address.toLowerCase();

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const password = await promptFn(address);
    this.cache.set(key, password);
    return password;
  }

  /**
   * Check if a password is cached for the given address.
   */
  has(address: string): boolean {
    return this.cache.has(address.toLowerCase());
  }

  /**
   * Get the number of cached passwords.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cached passwords immediately.
   * Overwrites values before deleting to reduce memory exposure.
   */
  clear(): void {
    for (const [key] of this.cache) {
      this.cache.set(key, '');
    }
    this.cache.clear();
  }

  /**
   * Register process exit handlers to auto-clear the cache.
   * Safe to call multiple times (idempotent).
   */
  registerExitHandler(): void {
    if (this.exitHandlerRegistered) {
      return;
    }

    const handler = () => {
      this.clear();
    };

    process.on('exit', handler);
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);

    this.exitHandlerRegistered = true;
  }

  /**
   * Remove a single cached entry.
   */
  remove(address: string): boolean {
    const key = address.toLowerCase();
    if (this.cache.has(key)) {
      this.cache.set(key, '');
      this.cache.delete(key);
      return true;
    }
    return false;
  }
}
