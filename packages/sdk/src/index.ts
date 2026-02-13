import { parseConfig, parseScriptTag } from './config';
import { emitSignal, removeSignal } from './signal';
import { showBadge, removeBadge } from './badge';
import { initMessaging, destroyMessaging } from './messaging';
import type { PaperwallConfig } from './types';

export const VERSION = '0.1.0';

/**
 * A live Paperwall SDK instance with a destroy() method.
 */
export interface PaperwallInstance {
  /** Tears down signal, messaging, and badge. */
  destroy(): void;
}

/**
 * Paperwall SDK entry point.
 */
export const Paperwall = {
  /**
   * Initializes the SDK with the given config.
   * Emits the x402 signal, starts messaging, and shows the badge.
   */
  init(input: Partial<PaperwallConfig>): PaperwallInstance {
    const config = parseConfig(input);

    emitSignal(config);
    initMessaging(config);
    showBadge();

    return {
      destroy() {
        removeSignal();
        destroyMessaging();
        removeBadge();
      },
    };
  },

  /**
   * Attempts to auto-initialize from a script tag's data-* attributes.
   * Returns the instance if successful, or null if the script tag
   * lacks the required data attributes.
   */
  autoInit(scriptElement: HTMLScriptElement): PaperwallInstance | null {
    const config = parseScriptTag(scriptElement);
    if (!config) {
      return null;
    }
    return Paperwall.init(config);
  },
};

// Re-export types for consumers
export type {
  PaperwallConfig,
  PaymentReceipt,
  PaymentError,
  PaymentErrorCode,
  PaymentOption,
  PaymentRequiredSignal,
} from './types';
export { PaperwallError } from './types';
export { parseConfig, parseScriptTag } from './config';
export { sendPing } from './messaging';

// IIFE auto-init: when loaded via <script> tag, attempt to self-initialize
if (typeof document !== 'undefined' && document.currentScript) {
  Paperwall.autoInit(document.currentScript as HTMLScriptElement);
}
