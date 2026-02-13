// ── Content Script Page Detector ──────────────────────────────────
// Scans the page for Paperwall <meta> tags and observes for dynamically
// added tags via MutationObserver.

const META_NAME = 'x402-payment-required';

/**
 * Parsed signal plus data-attributes from the meta tag.
 */
export interface DetectedPage {
  /** Decoded PaymentRequiredSignal from meta content. */
  signal: {
    x402Version: number;
    resource: { url: string; mimeType?: string };
    accepts: Array<{
      scheme: string;
      network: string;
      amount: string;
      asset: string;
      payTo: string;
      maxTimeoutSeconds?: number;
      extra?: Record<string, unknown>;
    }>;
    description?: string;
    error?: string;
    extensions?: Record<string, unknown>;
  };
  /** Facilitator service URL from data-facilitator-url attribute. */
  facilitatorUrl: string;
  /** Payment mode from data-mode attribute (defaults to 'client'). */
  mode: string;
  /** Optional site key from data-site-key attribute. */
  siteKey?: string;
}

/**
 * Scans the current document for a `<meta name="x402-payment-required">` tag.
 * Returns the decoded signal and data attributes, or null if not found / invalid.
 */
export function scanForPaperwall(): DetectedPage | null {
  const meta = document.querySelector<HTMLMetaElement>(
    `meta[name="${META_NAME}"]`,
  );

  if (!meta) {
    return null;
  }

  return parseMetaTag(meta);
}

/**
 * Observes the document `<head>` for dynamically added Paperwall meta tags.
 * Calls `callback` with the parsed DetectedPage when one appears.
 * Returns a disconnect function to stop observing.
 */
export function observeForPaperwall(
  callback: (detected: DetectedPage) => void,
): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node instanceof HTMLMetaElement &&
          node.name === META_NAME
        ) {
          const detected = parseMetaTag(node);
          if (detected) {
            callback(detected);
          }
        }
      }
    }
  });

  observer.observe(document.head, { childList: true });

  return () => observer.disconnect();
}

// ── Internal ────────────────────────────────────────────────────────

function parseMetaTag(meta: HTMLMetaElement): DetectedPage | null {
  const content = meta.content;
  if (!content) {
    return null;
  }

  try {
    const json = atob(content);
    const signal = JSON.parse(json) as DetectedPage['signal'];

    const facilitatorUrl =
      meta.getAttribute('data-facilitator-url') ?? '';
    const mode = meta.getAttribute('data-mode') ?? 'client';
    const siteKey = meta.getAttribute('data-site-key') ?? undefined;

    return { signal, facilitatorUrl, mode, siteKey };
  } catch {
    // Malformed base64 or invalid JSON
    return null;
  }
}
