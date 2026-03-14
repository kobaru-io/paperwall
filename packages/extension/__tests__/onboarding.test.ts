// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
  },
});

vi.mock('../src/shared/format.js', () => ({
  formatUsdcFromString: vi.fn((raw: string) => {
    return (Number(raw) / 1_000_000).toFixed(2);
  }),
  dollarToRaw: vi.fn((dollar: string) => {
    const num = parseFloat(dollar);
    if (isNaN(num) || num <= 0) return '0';
    return Math.round(num * 1_000_000).toString();
  }),
  rawToDollar: vi.fn((raw: string) => {
    return (Number(raw) / 1_000_000).toFixed(2);
  }),
}));

import { renderOnboarding } from '../src/popup/screens/onboarding.js';

describe('renderOnboarding', () => {
  let container: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    onComplete = vi.fn();
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    renderOnboarding(container, onComplete);

    expect(container.textContent).toContain('Set Your Spending Limits');
    expect(container.textContent).toContain('auto-pay limits');
  });

  it('renders three input fields with default values', () => {
    renderOnboarding(container, onComplete);

    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(3);
    expect(inputs[0]!.value).toBe('2.00');  // Daily $2.00
    expect(inputs[1]!.value).toBe('20.00'); // Monthly $20.00
    expect(inputs[2]!.value).toBe('0.50');  // Site $0.50
  });

  it('renders "Looks good" and "Skip for now" buttons', () => {
    renderOnboarding(container, onComplete);

    const buttons = container.querySelectorAll('button');
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toContain('Looks good');
    expect(texts).toContain('Skip for now');
  });

  it('"Looks good" sends custom values and calls onComplete', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

    renderOnboarding(container, onComplete);

    // Change input value
    const inputs = container.querySelectorAll('input');
    inputs[0]!.value = '5.00';

    const confirmBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
    confirmBtn.click();

    await vi.waitFor(() => {
      expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AUTO_PAY_INIT_DEFAULTS',
          dailyLimitRaw: '5000000',
          monthlyLimitRaw: '20000000',
          defaultSiteBudgetRaw: '500000',
        }),
      );
    });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('"Skip for now" sends default values', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

    renderOnboarding(container, onComplete);

    const skipBtn = container.querySelector('.btn-secondary') as HTMLButtonElement;
    skipBtn.click();

    await vi.waitFor(() => {
      expect(vi.mocked(chrome.runtime.sendMessage)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AUTO_PAY_INIT_DEFAULTS',
          dailyLimitRaw: '2000000',
          monthlyLimitRaw: '20000000',
          defaultSiteBudgetRaw: '500000',
        }),
      );
    });
  });

  it('shows validation error for zero values', async () => {
    renderOnboarding(container, onComplete);

    const inputs = container.querySelectorAll('input');
    inputs[0]!.value = '0';

    const confirmBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
    confirmBtn.click();

    // Should not send message
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    // Error should be displayed
    const error = container.querySelector('.field-error');
    expect(error!.textContent).toContain('greater than $0.00');
  });

  it('shows validation error for negative values', async () => {
    renderOnboarding(container, onComplete);

    const inputs = container.querySelectorAll('input');
    inputs[1]!.value = '-5';

    const confirmBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
    confirmBtn.click();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    const error = container.querySelector('.field-error');
    expect(error!.textContent).toContain('greater than $0.00');
  });
});
