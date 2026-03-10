// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderDashboard } from '../src/popup/screens/dashboard.js';

// ── Chrome API Mock ───────────────────────────────────────────────────

type MessageHandler = (message: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;

let sendMessageHandler: MessageHandler = () => ({ success: false });

const mockChrome = {
  runtime: {
    sendMessage: vi.fn((message: Record<string, unknown>) => {
      return Promise.resolve(sendMessageHandler(message));
    }),
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([{ id: 1 }])),
  },
};
Object.assign(globalThis, { chrome: mockChrome });

// ── Helpers ───────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

/**
 * Build a standard balances response for GET_BALANCES_ALL_NETWORKS.
 * Accepts partial overrides for each network.
 */
function makeBalancesResponse(overrides: Partial<Record<string, { raw: string; formatted: string }>> = {}): Record<string, unknown> {
  const defaults: Record<string, { raw: string; formatted: string; network: string; asset: string }> = {
    'eip155:324705682': { raw: '0', formatted: '0.00', network: 'eip155:324705682', asset: 'USDC' },
    'eip155:84532': { raw: '0', formatted: '0.00', network: 'eip155:84532', asset: 'USDC' },
    'eip155:1187947933': { raw: '0', formatted: '0.00', network: 'eip155:1187947933', asset: 'USDC' },
    'eip155:8453': { raw: '0', formatted: '0.00', network: 'eip155:8453', asset: 'USDC' },
  };

  for (const [key, value] of Object.entries(overrides)) {
    const existing = defaults[key];
    if (existing && value) {
      defaults[key] = { ...existing, raw: value.raw, formatted: value.formatted };
    }
  }

  return { success: true, balances: defaults };
}

/** Wait for all pending microtasks to flush. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('dashboard balance display', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
    vi.clearAllMocks();
  });

  it('zero balance shows $0.00 and top-up prompt', async () => {
    sendMessageHandler = (msg) => {
      if (msg['type'] === 'GET_BALANCES_ALL_NETWORKS') {
        return makeBalancesResponse();
      }
      if (msg['type'] === 'GET_HISTORY') {
        return { success: true, records: [] };
      }
      if (msg['type'] === 'GET_PAGE_STATE') {
        return { success: true, detected: false };
      }
      return { success: false };
    };

    renderDashboard(container, '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
    await flush();

    const balanceAmount = container.querySelector('.balance-amount');
    expect(balanceAmount).not.toBeNull();
    expect(balanceAmount!.textContent).toBe('$0.00');

    // Top Up button should be present
    const topUpButton = container.querySelector('.network-info-container button');
    expect(topUpButton).not.toBeNull();
    expect(topUpButton!.textContent).toBe('Top Up');

    // No breakdown should be present
    const breakdown = container.querySelector('.network-breakdown');
    expect(breakdown).toBeNull();
  });

  it('single-network balance renders without breakdown', async () => {
    sendMessageHandler = (msg) => {
      if (msg['type'] === 'GET_BALANCES_ALL_NETWORKS') {
        return makeBalancesResponse({
          'eip155:324705682': { raw: '1500000', formatted: '1.50' },
        });
      }
      if (msg['type'] === 'GET_HISTORY') {
        return { success: true, records: [] };
      }
      if (msg['type'] === 'GET_PAGE_STATE') {
        return { success: true, detected: false };
      }
      return { success: false };
    };

    renderDashboard(container, '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
    await flush();

    const balanceAmount = container.querySelector('.balance-amount');
    expect(balanceAmount).not.toBeNull();
    expect(balanceAmount!.textContent).toBe('$1.50');

    // Network name should be shown
    const networkName = container.querySelector('.balance-network-name');
    expect(networkName).not.toBeNull();
    expect(networkName!.textContent).toBe('SKALE Testnet');

    // No breakdown table
    const breakdown = container.querySelector('.network-breakdown');
    expect(breakdown).toBeNull();
  });

  it('multi-network balance shows aggregate + breakdown', async () => {
    sendMessageHandler = (msg) => {
      if (msg['type'] === 'GET_BALANCES_ALL_NETWORKS') {
        return makeBalancesResponse({
          'eip155:324705682': { raw: '1500000', formatted: '1.50' },
          'eip155:84532': { raw: '500000', formatted: '0.50' },
        });
      }
      if (msg['type'] === 'GET_HISTORY') {
        return { success: true, records: [] };
      }
      if (msg['type'] === 'GET_PAGE_STATE') {
        return { success: true, detected: false };
      }
      return { success: false };
    };

    renderDashboard(container, '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
    await flush();

    const balanceAmount = container.querySelector('.balance-amount');
    expect(balanceAmount).not.toBeNull();
    // 1.50 + 0.50 = 2.00
    expect(balanceAmount!.textContent).toBe('$2.00 total');

    // Breakdown should be present with all 4 networks
    const breakdown = container.querySelector('.network-breakdown');
    expect(breakdown).not.toBeNull();

    const rows = container.querySelectorAll('.network-row');
    expect(rows.length).toBe(4);

    // Verify specific amounts in rows
    const rowTexts = Array.from(rows).map((row) => {
      const name = row.querySelector('.network-row-name')?.textContent ?? '';
      const amount = row.querySelector('.network-row-amount')?.textContent ?? '';
      return { name: name.trim(), amount };
    });

    // SKALE Testnet row
    const skaleTestnet = rowTexts.find((r) => r.name.includes('SKALE Testnet'));
    expect(skaleTestnet).toBeDefined();
    expect(skaleTestnet!.amount).toBe('$1.50');

    // Base Sepolia row
    const baseSepolia = rowTexts.find((r) => r.name.includes('Base Sepolia'));
    expect(baseSepolia).toBeDefined();
    expect(baseSepolia!.amount).toBe('$0.50');

    // Zero-balance networks still shown
    const skaleMainnet = rowTexts.find((r) => r.name.includes('SKALE Mainnet'));
    expect(skaleMainnet).toBeDefined();
    expect(skaleMainnet!.amount).toBe('$0.00');
  });

  it('testnet balance shown with TEST indicator', async () => {
    sendMessageHandler = (msg) => {
      if (msg['type'] === 'GET_BALANCES_ALL_NETWORKS') {
        return makeBalancesResponse({
          'eip155:324705682': { raw: '1000000', formatted: '1.00' },
          'eip155:84532': { raw: '500000', formatted: '0.50' },
        });
      }
      if (msg['type'] === 'GET_HISTORY') {
        return { success: true, records: [] };
      }
      if (msg['type'] === 'GET_PAGE_STATE') {
        return { success: true, detected: false };
      }
      return { success: false };
    };

    renderDashboard(container, '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
    await flush();

    // Both testnet networks (SKALE Testnet, Base Sepolia) should have TEST badges
    const badges = container.querySelectorAll('.badge-test');
    expect(badges.length).toBe(2);

    // All TEST badges should say "TEST"
    for (const badge of badges) {
      expect(badge.textContent).toBe('TEST');
    }

    // Mainnet networks should NOT have TEST badges
    const rows = container.querySelectorAll('.network-row');
    for (const row of rows) {
      const nameEl = row.querySelector('.network-row-name');
      const name = nameEl?.childNodes[0]?.textContent ?? '';
      const hasBadge = row.querySelector('.badge-test') !== null;

      if (name.includes('SKALE Testnet') || name.includes('Base Sepolia')) {
        expect(hasBadge).toBe(true);
      } else {
        expect(hasBadge).toBe(false);
      }
    }
  });
});
