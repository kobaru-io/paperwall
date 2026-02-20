/**
 * SECURITY NOTE ON MEMORY WIPE
 *
 * This module provides best-effort wiping of sensitive buffers.
 * However, JavaScript runtime limitations mean complete memory clearing is not guaranteed:
 *
 * 1. Garbage Collector may preserve copies
 * 2. CPU caches may retain data
 * 3. Virtual memory/swap may write to disk
 * 4. Debugging tools may preserve state
 *
 * Use these functions as a defensive measure, not as absolute protection.
 */

// -- Public API ---

/**
 * Securely wipe sensitive buffer data by overwriting with zeros.
 * Prevents accidental exposure if GC doesn't immediately collect the buffer.
 *
 * @param buffer - Buffer to wipe (Buffer or Uint8Array)
 */
export function wipeBuffer(buffer: Buffer | Uint8Array): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = 0;
  }
}

/**
 * Wipe a string from memory by creating and clearing a buffer version.
 * Limited effectiveness due to JS string immutability, but included for completeness.
 *
 * @param str - String to wipe
 */
export function wipeString(str: string): void {
  const buffer = Buffer.from(str);
  wipeBuffer(buffer);
}
