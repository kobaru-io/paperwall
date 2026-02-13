/**
 * Stderr logger for human-readable status messages.
 *
 * All messages go to stderr so stdout remains JSON-only.
 * AI agents ignore stderr; human operators see it as debug info.
 */

/**
 * Write a prefixed log message to stderr.
 *
 * @param message - Human-readable message (no newline needed)
 */
export function log(message: string): void {
  process.stderr.write(`[paperwall] ${message}\n`);
}
