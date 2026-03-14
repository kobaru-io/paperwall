// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderBudget } from '../src/popup/screens/budget.js';

// ── Chrome API Mock ───────────────────────────────────────────────────

type MessageHandler = (
  message: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

let sendMessageHandler: MessageHandler = () => ({ success: false });

const storageListeners: Array<(changes: Record<string, unknown>) => void> = [];

const mockChrome = {
  runtime: {
    sendMessage: vi.fn((message: Record<string, unknown>) => {
      return Promise.resolve(sendMessageHandler(message));
    }),
  },
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn((fn: (changes: Record<string, unknown>) => void) => {
        storageListeners.push(fn);
      }),
      removeListener: vi.fn((fn: (changes: Record<string, unknown>) => void) => {
        const idx = storageListeners.indexOf(fn);
        if (idx >= 0) storageListeners.splice(idx, 1);
      }),
    },
  },
};
Object.assign(globalThis, { chrome: mockChrome });

// ── Helpers ───────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeRules(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    globalEnabled: true,
    dailyLimitRaw: '2000000',
    monthlyLimitRaw: '20000000',
    dailySpentRaw: '0',
    monthlySpentRaw: '0',
    dailyPeriodStart: Date.now(),
    monthlyPeriodStart: Date.now(),
    defaultSiteBudgetRaw: '500000',
    defaultMaxAmountRaw: '100000',
    sites: {},
    denylist: [],
    onboardingCompleted: true,
    explainerDismissed: true,
    ...overrides,
  };
}

function makeSite(origin: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    origin,
    maxAmountRaw: '100000',
    monthlyBudgetRaw: '500000',
    monthlySpentRaw: '0',
    monthlyPeriodStart: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('renderBudget', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
    vi.clearAllMocks();
    storageListeners.length = 0;
  });

  afterEach(() => {
    storageListeners.length = 0;
  });

  // ── Main View Rendering ────────────────────────────────────────

  describe('main view', () => {
    it('renders heading, toggle, and progress bars with mock data', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              dailySpentRaw: '500000',
              monthlySpentRaw: '5000000',
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const heading = container.querySelector('.screen-title');
      expect(heading).not.toBeNull();
      expect(heading!.textContent).toBe('Budget');

      // Toggle switch is present and enabled
      const toggle = container.querySelector('.budget-toggle-switch');
      expect(toggle).not.toBeNull();
      expect(toggle!.getAttribute('aria-checked')).toBe('true');
      expect(toggle!.classList.contains('budget-toggle-switch--on')).toBe(true);

      // Progress bars present
      const progressBars = container.querySelectorAll('.budget-progress');
      expect(progressBars.length).toBe(2);

      // Daily: $0.50 / $2.00
      const amounts = container.querySelectorAll('.budget-progress-amount');
      expect(amounts[0]!.textContent).toContain('$0.50');
      expect(amounts[0]!.textContent).toContain('$2.00');

      // Monthly: $5.00 / $20.00
      expect(amounts[1]!.textContent).toContain('$5.00');
      expect(amounts[1]!.textContent).toContain('$20.00');

      // Action buttons
      expect(container.querySelector('[aria-label="Edit global limits"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Manage blocked sites"]')).not.toBeNull();
    });

    it('renders empty state when no trusted sites', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules() };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const emptyTitle = container.querySelector('.budget-empty-title');
      expect(emptyTitle).not.toBeNull();
      expect(emptyTitle!.textContent).toBe('No trusted sites yet');

      const emptyText = container.querySelector('.budget-empty-text');
      expect(emptyText).not.toBeNull();
      expect(emptyText!.textContent).toContain('auto-pay');
    });

    it('renders trusted sites sorted by monthly spend', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              sites: {
                'https://low.com': makeSite('https://low.com', { monthlySpentRaw: '100000' }),
                'https://high.com': makeSite('https://high.com', { monthlySpentRaw: '400000' }),
                'https://mid.com': makeSite('https://mid.com', { monthlySpentRaw: '250000' }),
              },
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const origins = container.querySelectorAll('.budget-site-origin');
      expect(origins.length).toBe(3);
      expect(origins[0]!.textContent).toBe('https://high.com');
      expect(origins[1]!.textContent).toBe('https://mid.com');
      expect(origins[2]!.textContent).toBe('https://low.com');
    });
  });

  // ── Progress Bar Color Thresholds ──────────────────────────────

  describe('progress bar colors', () => {
    it('shows green fill when usage < 70%', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({ dailySpentRaw: '1000000', dailyLimitRaw: '2000000' }), // 50%
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const fill = container.querySelector('.budget-progress-fill') as HTMLElement;
      expect(fill).not.toBeNull();
      expect(fill.style.backgroundColor).toBe('var(--color-success)');
      expect(fill.style.width).toBe('50%');
    });

    it('shows amber fill when usage is 70-84%', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({ dailySpentRaw: '1500000', dailyLimitRaw: '2000000' }), // 75%
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const fill = container.querySelector('.budget-progress-fill') as HTMLElement;
      expect(fill).not.toBeNull();
      // jsdom converts hex to rgb
      expect(fill.style.backgroundColor).toBe('rgb(217, 119, 6)');
    });

    it('shows red fill when usage >= 85%', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({ dailySpentRaw: '1800000', dailyLimitRaw: '2000000' }), // 90%
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const fill = container.querySelector('.budget-progress-fill') as HTMLElement;
      expect(fill).not.toBeNull();
      expect(fill.style.backgroundColor).toBe('var(--color-error)');
    });
  });

  // ── Pause Toggle ───────────────────────────────────────────────

  describe('pause toggle', () => {
    it('shows paused banner and grayed bars when disabled', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              globalEnabled: false,
              dailySpentRaw: '1000000',
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      // Paused banner
      const banner = container.querySelector('.budget-paused-banner');
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toBe('Auto-pay is paused');
      expect(banner!.getAttribute('role')).toBe('status');

      // Toggle switch off state
      const toggle = container.querySelector('.budget-toggle-switch');
      expect(toggle!.getAttribute('aria-checked')).toBe('false');
      expect(toggle!.classList.contains('budget-toggle-switch--on')).toBe(false);

      // Progress track is paused
      const track = container.querySelector('.budget-progress-track--paused');
      expect(track).not.toBeNull();

      // Fill color is secondary (grayed)
      const fill = container.querySelector('.budget-progress-fill') as HTMLElement;
      expect(fill.style.backgroundColor).toBe('var(--color-text-secondary)');
    });

    it('sends toggle message when switch is clicked', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules({ globalEnabled: true }) };
        }
        if (msg['type'] === 'AUTO_PAY_TOGGLE_PAUSE') {
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const toggle = container.querySelector('.budget-toggle-switch') as HTMLButtonElement;
      toggle.click();
      await flush();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_TOGGLE_PAUSE',
        enabled: false,
      });
    });
  });

  // ── Inline Edit Flow ──────────────────────────────────────────

  describe('inline edit', () => {
    it('expands edit panel when Edit is clicked', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              sites: {
                'https://example.com': makeSite('https://example.com', {
                  monthlyBudgetRaw: '500000',
                  maxAmountRaw: '100000',
                }),
              },
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      // No edit panel initially
      expect(container.querySelector('.budget-site-edit')).toBeNull();

      // Click Edit
      const editBtn = container.querySelector('[aria-label="Edit https://example.com"]') as HTMLButtonElement;
      expect(editBtn).not.toBeNull();
      editBtn.click();
      await flush();

      // Edit panel appears
      const editPanel = container.querySelector('.budget-site-edit');
      expect(editPanel).not.toBeNull();

      // Inputs pre-filled with converted values
      const inputs = editPanel!.querySelectorAll('.field-input') as NodeListOf<HTMLInputElement>;
      expect(inputs.length).toBe(2);
      expect(inputs[0]!.value).toBe('0.50'); // monthlyBudget
      expect(inputs[1]!.value).toBe('0.10'); // maxAmount
    });

    it('sends update message on Save', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              sites: {
                'https://example.com': makeSite('https://example.com'),
              },
            }),
          };
        }
        if (msg['type'] === 'AUTO_PAY_UPDATE_SITE') {
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      // Open edit
      const editBtn = container.querySelector('[aria-label="Edit https://example.com"]') as HTMLButtonElement;
      editBtn.click();
      await flush();

      // Change input values
      const inputs = container.querySelectorAll('.budget-site-edit .field-input') as NodeListOf<HTMLInputElement>;
      inputs[0]!.value = '1.00';
      inputs[1]!.value = '0.25';

      // Click Save
      const saveBtn = container.querySelector('[aria-label="Save changes for https://example.com"]') as HTMLButtonElement;
      saveBtn.click();
      await flush();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_UPDATE_SITE',
        origin: 'https://example.com',
        monthlyBudgetRaw: '1000000',
        maxAmountRaw: '250000',
      });
    });

    it('shows validation error for invalid input', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              sites: { 'https://example.com': makeSite('https://example.com') },
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const editBtn = container.querySelector('[aria-label="Edit https://example.com"]') as HTMLButtonElement;
      editBtn.click();
      await flush();

      const inputs = container.querySelectorAll('.budget-site-edit .field-input') as NodeListOf<HTMLInputElement>;
      inputs[0]!.value = 'abc';

      const saveBtn = container.querySelector('[aria-label="Save changes for https://example.com"]') as HTMLButtonElement;
      saveBtn.click();
      await flush();

      const error = container.querySelector('.budget-site-edit .field-error');
      expect(error).not.toBeNull();
      expect(error!.textContent).toBe('Invalid budget amount.');
    });

    it('collapses edit panel on Cancel', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              sites: { 'https://example.com': makeSite('https://example.com') },
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const editBtn = container.querySelector('[aria-label="Edit https://example.com"]') as HTMLButtonElement;
      editBtn.click();
      await flush();
      expect(container.querySelector('.budget-site-edit')).not.toBeNull();

      const cancelBtn = container.querySelectorAll('.budget-edit-actions .btn-secondary')[0] as HTMLButtonElement;
      cancelBtn.click();
      await flush();

      expect(container.querySelector('.budget-site-edit')).toBeNull();
    });

    it('sends remove message when Remove is clicked', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              sites: { 'https://example.com': makeSite('https://example.com') },
            }),
          };
        }
        if (msg['type'] === 'AUTO_PAY_REMOVE_SITE') {
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const removeBtn = container.querySelector('[aria-label="Remove https://example.com"]') as HTMLButtonElement;
      removeBtn.click();
      await flush();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_REMOVE_SITE',
        origin: 'https://example.com',
      });
    });
  });

  // ── Globals Edit Sub-View ─────────────────────────────────────

  describe('globals edit sub-view', () => {
    it('navigates to globals view and displays current limits', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              dailyLimitRaw: '2000000',
              monthlyLimitRaw: '20000000',
              defaultSiteBudgetRaw: '500000',
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      // Click Edit limits
      const editLimitsBtn = container.querySelector('[aria-label="Edit global limits"]') as HTMLButtonElement;
      editLimitsBtn.click();
      await flush();

      const heading = container.querySelector('.screen-title');
      expect(heading!.textContent).toBe('Edit Limits');

      const inputs = container.querySelectorAll('.field-input') as NodeListOf<HTMLInputElement>;
      expect(inputs.length).toBe(3);
      expect(inputs[0]!.value).toBe('2.00'); // daily
      expect(inputs[1]!.value).toBe('20.00'); // monthly
      expect(inputs[2]!.value).toBe('0.50'); // default site
    });

    it('saves globals and returns to main view', async () => {
      let callCount = 0;
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules() };
        }
        if (msg['type'] === 'AUTO_PAY_UPDATE_GLOBALS') {
          callCount++;
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      // Navigate to globals
      const editLimitsBtn = container.querySelector('[aria-label="Edit global limits"]') as HTMLButtonElement;
      editLimitsBtn.click();
      await flush();

      // Update values
      const inputs = container.querySelectorAll('.field-input') as NodeListOf<HTMLInputElement>;
      inputs[0]!.value = '5.00';
      inputs[1]!.value = '50.00';
      inputs[2]!.value = '1.00';

      // Save
      const saveBtn = container.querySelector('[aria-label="Save global limits"]') as HTMLButtonElement;
      saveBtn.click();
      await flush();

      expect(callCount).toBe(1);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_UPDATE_GLOBALS',
        dailyLimitRaw: '5000000',
        monthlyLimitRaw: '50000000',
        defaultSiteBudgetRaw: '1000000',
      });

      // Back on main view
      await flush();
      const heading = container.querySelector('.screen-title');
      expect(heading!.textContent).toBe('Budget');
    });

    it('navigates back to main view with Back button', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules() };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const editLimitsBtn = container.querySelector('[aria-label="Edit global limits"]') as HTMLButtonElement;
      editLimitsBtn.click();
      await flush();

      expect(container.querySelector('.screen-title')!.textContent).toBe('Edit Limits');

      const backBtn = container.querySelector('[aria-label="Back to budget overview"]') as HTMLButtonElement;
      backBtn.click();
      await flush();

      expect(container.querySelector('.screen-title')!.textContent).toBe('Budget');
    });

    it('resets to defaults when Reset button is clicked', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              dailyLimitRaw: '9000000',
              monthlyLimitRaw: '90000000',
              defaultSiteBudgetRaw: '2000000',
            }),
          };
        }
        if (msg['type'] === 'AUTO_PAY_UPDATE_GLOBALS') {
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const editLimitsBtn = container.querySelector('[aria-label="Edit global limits"]') as HTMLButtonElement;
      editLimitsBtn.click();
      await flush();

      const resetBtn = container.querySelector('[aria-label="Reset limits to default values"]') as HTMLButtonElement;
      resetBtn.click();
      await flush();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_UPDATE_GLOBALS',
        dailyLimitRaw: '2000000',
        monthlyLimitRaw: '20000000',
        defaultSiteBudgetRaw: '500000',
      });
    });
  });

  // ── Denylist Sub-View ─────────────────────────────────────────

  describe('denylist sub-view', () => {
    it('navigates to denylist view and shows blocked sites', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({
              denylist: ['https://spam.com', 'https://ads.com'],
            }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const blockedBtn = container.querySelector('[aria-label="Manage blocked sites"]') as HTMLButtonElement;
      blockedBtn.click();
      await flush();

      const heading = container.querySelector('.screen-title');
      expect(heading!.textContent).toBe('Blocked Sites');

      const origins = container.querySelectorAll('.budget-denylist-origin');
      expect(origins.length).toBe(2);
      expect(origins[0]!.textContent).toBe('https://spam.com');
      expect(origins[1]!.textContent).toBe('https://ads.com');
    });

    it('shows empty message when denylist is empty', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules({ denylist: [] }) };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const blockedBtn = container.querySelector('[aria-label="Manage blocked sites"]') as HTMLButtonElement;
      blockedBtn.click();
      await flush();

      const emptyText = container.querySelector('.budget-empty-text');
      expect(emptyText).not.toBeNull();
      expect(emptyText!.textContent).toBe('No blocked sites.');
    });

    it('adds a site to denylist', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules({ denylist: [] }) };
        }
        if (msg['type'] === 'AUTO_PAY_ADD_DENYLIST') {
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const blockedBtn = container.querySelector('[aria-label="Manage blocked sites"]') as HTMLButtonElement;
      blockedBtn.click();
      await flush();

      const input = container.querySelector('[aria-label="Site origin to block"]') as HTMLInputElement;
      input.value = 'https://bad-site.com';

      const addBtn = container.querySelector('[aria-label="Add site to block list"]') as HTMLButtonElement;
      addBtn.click();
      await flush();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_ADD_DENYLIST',
        origin: 'https://bad-site.com',
      });
    });

    it('removes a site from denylist', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({ denylist: ['https://spam.com'] }),
          };
        }
        if (msg['type'] === 'AUTO_PAY_REMOVE_DENYLIST') {
          return { success: true };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const blockedBtn = container.querySelector('[aria-label="Manage blocked sites"]') as HTMLButtonElement;
      blockedBtn.click();
      await flush();

      const removeBtn = container.querySelector('[aria-label="Unblock https://spam.com"]') as HTMLButtonElement;
      removeBtn.click();
      await flush();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTO_PAY_REMOVE_DENYLIST',
        origin: 'https://spam.com',
      });
    });

    it('navigates back from denylist to main view', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules() };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      const blockedBtn = container.querySelector('[aria-label="Manage blocked sites"]') as HTMLButtonElement;
      blockedBtn.click();
      await flush();

      expect(container.querySelector('.screen-title')!.textContent).toBe('Blocked Sites');

      const backBtn = container.querySelector('[aria-label="Back to budget overview"]') as HTMLButtonElement;
      backBtn.click();
      await flush();

      expect(container.querySelector('.screen-title')!.textContent).toBe('Budget');
    });
  });

  // ── Reactive Updates ──────────────────────────────────────────

  describe('reactive updates via onChanged', () => {
    it('registers storage listener on render', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules() };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();
      expect(storageListeners.length).toBe(1);
    });

    it('re-renders when autoPayRules storage changes', async () => {
      let spentRaw = '0';
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return {
            success: true,
            rules: makeRules({ dailySpentRaw: spentRaw }),
          };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();

      // Initially $0.00
      let amounts = container.querySelectorAll('.budget-progress-amount');
      expect(amounts[0]!.textContent).toContain('$0.00');

      // Simulate storage change
      spentRaw = '1000000';
      for (const listener of storageListeners) {
        listener({ autoPayRules: { newValue: {} } });
      }
      await flush();

      // Now $1.00
      amounts = container.querySelectorAll('.budget-progress-amount');
      expect(amounts[0]!.textContent).toContain('$1.00');
    });

    it('removes old listener when re-rendered', async () => {
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          return { success: true, rules: makeRules() };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();
      expect(storageListeners.length).toBe(1);

      // Re-render
      renderBudget(container);
      await flush();

      expect(mockChrome.storage.onChanged.removeListener).toHaveBeenCalled();
      // Old listener removed, new one added
      expect(storageListeners.length).toBe(1);
    });

    it('ignores storage changes for other keys', async () => {
      let callCount = 0;
      sendMessageHandler = (msg) => {
        if (msg['type'] === 'GET_AUTO_PAY_RULES') {
          callCount++;
          return { success: true, rules: makeRules() };
        }
        return { success: false };
      };

      renderBudget(container);
      await flush();
      const initialCallCount = callCount;

      // Fire a change for a different key
      for (const listener of storageListeners) {
        listener({ someOtherKey: { newValue: 'something' } });
      }
      await flush();

      // Should NOT have re-fetched
      expect(callCount).toBe(initialCallCount);
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('shows error message when rules fail to load', async () => {
      sendMessageHandler = () => ({ success: false });

      renderBudget(container);
      await flush();

      const error = container.querySelector('.budget-error');
      expect(error).not.toBeNull();
      expect(error!.textContent).toBe('Failed to load budget data.');
      expect(error!.getAttribute('role')).toBe('alert');
    });
  });
});
