// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Chrome API Mock ────────────────────────────────────────────────

const sendMessageMock = vi.fn();

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: sendMessageMock,
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

import { initBridge, destroyBridge } from '../src/content/bridge.js';

// ── Tests ──────────────────────────────────────────────────────────

describe('bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    destroyBridge();
  });

  describe('SDK to Service Worker relay', () => {
    it('PAPERWALL_PAYMENT_REQUIRED postMessage relays PAGE_HAS_PAPERWALL to chrome.runtime', async () => {
      initBridge();

      // Use dispatchEvent to ensure synchronous origin handling in jsdom
      const event = new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_REQUIRED',
          requestId: 'req-123',
          facilitatorUrl: 'https://gateway.kobaru.io',
          payTo: '0xabc',
          price: '10000',
          network: 'eip155:324705682',
          mode: 'client',
        },
        origin: window.location.origin,
      });
      window.dispatchEvent(event);

      // dispatchEvent is synchronous, but give a tick for safety
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const sentMessage = sendMessageMock.mock.calls[0]![0];
      expect(sentMessage.type).toBe('PAGE_HAS_PAPERWALL');
      expect(sentMessage.requestId).toBe('req-123');
      expect(sentMessage.facilitatorUrl).toBe('https://gateway.kobaru.io');
      expect(sentMessage.payTo).toBe('0xabc');
      expect(sentMessage.price).toBe('10000');
      expect(sentMessage.network).toBe('eip155:324705682');
    });

    it('messages from wrong origin are ignored', async () => {
      initBridge();

      const event = new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_REQUIRED',
          requestId: 'req-456',
        },
        origin: 'https://evil.com',
      });
      window.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('non-PAPERWALL messages are ignored', async () => {
      initBridge();

      const event = new MessageEvent('message', {
        data: { type: 'SOME_OTHER_MESSAGE', data: 'hello' },
        origin: window.location.origin,
      });
      window.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('Service Worker to SDK relay (via chrome.runtime.onMessage)', () => {
    it('PAYMENT_COMPLETE messages are relayed as PAPERWALL_PAYMENT_RESULT', async () => {
      const postedMessages: Array<Record<string, unknown>> = [];
      const msgListener = (event: MessageEvent) => {
        if (event.data?.type === 'PAPERWALL_PAYMENT_RESULT') {
          postedMessages.push(event.data);
        }
      };
      window.addEventListener('message', msgListener);

      initBridge();

      // Simulate service worker sending PAYMENT_COMPLETE via chrome.runtime.onMessage
      // Get the listener that was added
      const addListenerMock = vi.mocked(chrome.runtime.onMessage.addListener);
      expect(addListenerMock).toHaveBeenCalled();
      const runtimeListener = addListenerMock.mock.calls[0]![0];

      // Trigger the listener with a PAYMENT_COMPLETE message
      runtimeListener(
        {
          type: 'PAYMENT_COMPLETE',
          requestId: 'req-789',
          success: true,
          receipt: {
            txHash: '0xdeadbeef',
            network: 'eip155:324705682',
            amount: '10000',
          },
        },
        {} as chrome.runtime.MessageSender,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(postedMessages.length).toBeGreaterThanOrEqual(1);
      const result = postedMessages[0]!;
      expect(result.type).toBe('PAPERWALL_PAYMENT_RESULT');
      expect(result.success).toBe(true);
      expect(result.requestId).toBe('req-789');

      window.removeEventListener('message', msgListener);
    });
  });

  describe('optimistic message relay', () => {
    function getRuntimeListener() {
      const addListenerMock = vi.mocked(chrome.runtime.onMessage.addListener);
      return addListenerMock.mock.calls[0]![0];
    }

    it('should relay PAYMENT_OPTIMISTIC as PAPERWALL_PAYMENT_RESULT with optimistic=true', async () => {
      const postedMessages: Array<Record<string, unknown>> = [];
      const msgListener = (event: MessageEvent) => {
        if (event.data?.type === 'PAPERWALL_PAYMENT_RESULT') {
          postedMessages.push(event.data);
        }
      };
      window.addEventListener('message', msgListener);
      initBridge();

      getRuntimeListener()(
        { type: 'PAYMENT_OPTIMISTIC', requestId: 'req-1', amount: '50000', url: 'https://example.com' },
        {} as chrome.runtime.MessageSender,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(postedMessages.length).toBeGreaterThanOrEqual(1);
      const msg = postedMessages.find(m => m.optimistic === true)!;
      expect(msg.type).toBe('PAPERWALL_PAYMENT_RESULT');
      expect(msg.requestId).toBe('req-1');
      expect(msg.success).toBe(true);
      expect(msg.optimistic).toBe(true);

      window.removeEventListener('message', msgListener);
    });

    it('should relay PAYMENT_CONFIRMED as PAPERWALL_PAYMENT_RESULT with confirmed=true', async () => {
      const postedMessages: Array<Record<string, unknown>> = [];
      const msgListener = (event: MessageEvent) => {
        if (event.data?.type === 'PAPERWALL_PAYMENT_RESULT') {
          postedMessages.push(event.data);
        }
      };
      window.addEventListener('message', msgListener);
      initBridge();

      getRuntimeListener()(
        { type: 'PAYMENT_CONFIRMED', requestId: 'req-1', success: true, receipt: { txHash: '0xabc' } },
        {} as chrome.runtime.MessageSender,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const msg = postedMessages.find(m => m.confirmed === true)!;
      expect(msg.type).toBe('PAPERWALL_PAYMENT_RESULT');
      expect(msg.success).toBe(true);
      expect(msg.confirmed).toBe(true);

      window.removeEventListener('message', msgListener);
    });

    it('should relay PAYMENT_SETTLE_FAILED as PAPERWALL_PAYMENT_RESULT with success=false', async () => {
      const postedMessages: Array<Record<string, unknown>> = [];
      const msgListener = (event: MessageEvent) => {
        if (event.data?.type === 'PAPERWALL_PAYMENT_RESULT') {
          postedMessages.push(event.data);
        }
      };
      window.addEventListener('message', msgListener);
      initBridge();

      getRuntimeListener()(
        { type: 'PAYMENT_SETTLE_FAILED', requestId: 'req-1', success: false, error: 'Timeout' },
        {} as chrome.runtime.MessageSender,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(postedMessages.length).toBeGreaterThanOrEqual(1);
      const msg = postedMessages[0]!;
      expect(msg.type).toBe('PAPERWALL_PAYMENT_RESULT');
      expect(msg.success).toBe(false);
      expect(msg.error).toBe('Timeout');

      window.removeEventListener('message', msgListener);
    });
  });

  describe('PING/PONG', () => {
    it('PAPERWALL_PING receives PAPERWALL_PONG response (no SW needed)', async () => {
      const postedMessages: Array<Record<string, unknown>> = [];
      const msgListener = (event: MessageEvent) => {
        if (event.data?.type === 'PAPERWALL_PONG') {
          postedMessages.push(event.data);
        }
      };
      window.addEventListener('message', msgListener);

      initBridge();

      const event = new MessageEvent('message', {
        data: { type: 'PAPERWALL_PING' },
        origin: window.location.origin,
      });
      window.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(postedMessages.length).toBe(1);
      expect(postedMessages[0]!.type).toBe('PAPERWALL_PONG');

      window.removeEventListener('message', msgListener);
    });
  });

  describe('destroyBridge', () => {
    it('stops relaying messages after destroy', async () => {
      initBridge();
      destroyBridge();

      const event = new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_REQUIRED',
          requestId: 'req-999',
          facilitatorUrl: 'https://gateway.kobaru.io',
        },
        origin: window.location.origin,
      });
      window.dispatchEvent(event);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });
});
