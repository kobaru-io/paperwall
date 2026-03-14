// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── DOM + Chrome Mocks ──────────────────────────────────────────────

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
});

// Mock constants module
vi.mock('../src/shared/constants.js', () => ({
  getNetwork: vi.fn(() => ({ name: 'SKALE Testnet', rpcUrl: '', usdcAddress: '0x', chainId: 1 })),
  isTestnet: vi.fn(() => true),
  getAllNetworks: vi.fn(() => new Map()),
}));

import { renderPaymentPrompt } from '../src/popup/screens/payment.js';

// ── Helpers ──────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makePageState(overrides: Record<string, unknown> = {}) {
  return {
    origin: 'https://example.com',
    price: '10000',
    network: 'eip155:324705682',
    facilitatorUrl: 'https://gateway.kobaru.io',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('renderPaymentPrompt', () => {
  let container: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
    onComplete = vi.fn();
    vi.clearAllMocks();
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 }] as chrome.tabs.Tab[]);
  });

  describe('3-button rendering', () => {
    it('renders auto-approve, pay once, reject, and block buttons', () => {
      renderPaymentPrompt(container, makePageState(), onComplete);

      const buttons = container.querySelectorAll('button');
      const texts = Array.from(buttons).map((b) => b.textContent);

      expect(texts.some((t) => t?.includes('Auto-approve'))).toBe(true);
      expect(texts.some((t) => t?.includes('once'))).toBe(true);
      expect(texts).toContain('Reject');
      expect(texts).toContain('Block this site');
    });

    it('renders in vertical stack layout', () => {
      renderPaymentPrompt(container, makePageState(), onComplete);

      const stack = container.querySelector('.payment-buttons-stack');
      expect(stack).not.toBeNull();
    });

    it('displays site origin and formatted price', () => {
      renderPaymentPrompt(container, makePageState(), onComplete);

      expect(container.textContent).toContain('https://example.com');
      expect(container.textContent).toContain('$0.01 USDC');
    });
  });

  describe('auto-approve flow', () => {
    it('sends SIGN_AND_PAY then AUTO_PAY_TRUST_SITE on success', async () => {
      vi.mocked(chrome.runtime.sendMessage)
        .mockResolvedValueOnce({ success: true, transaction: '0xabc123' }) // SIGN_AND_PAY
        .mockResolvedValueOnce({ success: true }) // AUTO_PAY_TRUST_SITE
        .mockResolvedValueOnce({ success: true, rules: { explainerDismissed: true } }); // GET_AUTO_PAY_RULES

      renderPaymentPrompt(container, makePageState(), onComplete);

      const autoApproveBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
      autoApproveBtn.click();

      // Wait for async handlers
      await vi.waitFor(() => {
        expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'SIGN_AND_PAY' }),
        );
      });

      await vi.waitFor(() => {
        expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'AUTO_PAY_TRUST_SITE',
            origin: 'https://example.com',
            maxAmountRaw: '10000',
          }),
        );
      });
    });
  });

  describe('pay once flow', () => {
    it('sends only SIGN_AND_PAY without trusting site', async () => {
      vi.mocked(chrome.runtime.sendMessage)
        .mockResolvedValueOnce({ success: true, transaction: '0xabc' });

      renderPaymentPrompt(container, makePageState(), onComplete);

      const payOnceBtn = container.querySelector('.btn-secondary') as HTMLButtonElement;
      payOnceBtn.click();

      await vi.waitFor(() => {
        expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'SIGN_AND_PAY' }),
        );
      });

      // Should NOT call AUTO_PAY_TRUST_SITE
      expect(vi.mocked(chrome.runtime.sendMessage)).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTO_PAY_TRUST_SITE' }),
      );
    });
  });

  describe('block flow with confirmation', () => {
    it('shows confirmation dialog when block is clicked', () => {
      renderPaymentPrompt(container, makePageState(), onComplete);

      const blockLink = container.querySelector('.btn-link--danger') as HTMLButtonElement;
      blockLink.click();

      const confirm = container.querySelector('.payment-block-confirm') as HTMLElement;
      expect(confirm.style.display).toBe('');
      expect(confirm.textContent).toContain('Block');
    });

    it('sends ADD_DENYLIST and calls onComplete on confirm', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      renderPaymentPrompt(container, makePageState(), onComplete);

      // Click block link
      const blockLink = container.querySelector('.btn-link--danger') as HTMLButtonElement;
      blockLink.click();

      // Click confirm
      const confirmBtn = container.querySelector('.btn-danger') as HTMLButtonElement;
      confirmBtn.click();

      await vi.waitFor(() => {
        expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'AUTO_PAY_ADD_DENYLIST',
            origin: 'https://example.com',
          }),
        );
      });

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });
    });

    it('hides confirmation on cancel', () => {
      renderPaymentPrompt(container, makePageState(), onComplete);

      const blockLink = container.querySelector('.btn-link--danger') as HTMLButtonElement;
      blockLink.click();

      const cancelBtn = container.querySelectorAll('.payment-block-confirm button')[1] as HTMLButtonElement;
      cancelBtn.click();

      const confirm = container.querySelector('.payment-block-confirm') as HTMLElement;
      expect(confirm.style.display).toBe('none');
    });
  });

  describe('budget-exceeded variant', () => {
    it('shows yellow alert banner for budget exceeded', () => {
      renderPaymentPrompt(
        container,
        makePageState({ autoPayReason: 'Site monthly budget exceeded' }),
        onComplete,
      );

      const alert = container.querySelector('.payment-alert');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain('spending limit');
    });

    it('shows "Increase Budget" button text', () => {
      renderPaymentPrompt(
        container,
        makePageState({ autoPayReason: 'Global daily budget exceeded' }),
        onComplete,
      );

      const primary = container.querySelector('.btn-primary') as HTMLButtonElement;
      expect(primary.textContent).toContain('Increase Budget');
    });
  });

  describe('price-increased variant', () => {
    it('shows alert for price increase', () => {
      renderPaymentPrompt(
        container,
        makePageState({ autoPayReason: 'Price exceeds max amount (50000)' }),
        onComplete,
      );

      const alert = container.querySelector('.payment-alert');
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toContain('price exceeds');
    });

    it('shows "Update Limit" button text', () => {
      renderPaymentPrompt(
        container,
        makePageState({ autoPayReason: 'Price exceeds max amount (50000)' }),
        onComplete,
      );

      const primary = container.querySelector('.btn-primary') as HTMLButtonElement;
      expect(primary.textContent).toContain('Update Limit');
    });
  });

  describe('explainer overlay', () => {
    it('shows explainer on first auto-approve when not dismissed', async () => {
      vi.mocked(chrome.runtime.sendMessage)
        .mockResolvedValueOnce({ success: true, transaction: '0xabc' }) // SIGN_AND_PAY
        .mockResolvedValueOnce({ success: true }) // AUTO_PAY_TRUST_SITE
        .mockResolvedValueOnce({
          success: true,
          rules: { explainerDismissed: false },
        }); // GET_AUTO_PAY_RULES

      renderPaymentPrompt(container, makePageState(), onComplete);

      const autoApproveBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
      autoApproveBtn.click();

      await vi.waitFor(() => {
        const overlay = container.querySelector('.explainer-overlay');
        expect(overlay).not.toBeNull();
      });
    });

    it('does NOT show explainer when already dismissed', async () => {
      vi.mocked(chrome.runtime.sendMessage)
        .mockResolvedValueOnce({ success: true, transaction: '0xabc' })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({
          success: true,
          rules: { explainerDismissed: true },
        });

      renderPaymentPrompt(container, makePageState(), onComplete);

      const autoApproveBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
      autoApproveBtn.click();

      await vi.waitFor(() => {
        expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledTimes(3);
      });

      const overlay = container.querySelector('.explainer-overlay');
      expect(overlay).toBeNull();
    });
  });

  describe('button states during processing', () => {
    it('disables all buttons during payment', async () => {
      // Never resolve to keep buttons disabled
      vi.mocked(chrome.runtime.sendMessage).mockReturnValue(new Promise(() => {}));

      renderPaymentPrompt(container, makePageState(), onComplete);

      const autoApproveBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
      autoApproveBtn.click();

      // Use setTimeout to let the event handler execute
      await new Promise((r) => setTimeout(r, 10));

      const buttons = container.querySelectorAll('button');
      const disabledCount = Array.from(buttons).filter((b) => b.disabled).length;
      expect(disabledCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('reject', () => {
    it('calls onComplete on reject', () => {
      renderPaymentPrompt(container, makePageState(), onComplete);

      const rejectLink = container.querySelector('.btn-link:not(.btn-link--danger)') as HTMLButtonElement;
      rejectLink.click();

      expect(onComplete).toHaveBeenCalled();
    });
  });
});
