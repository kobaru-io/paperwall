// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderSettings } from '../screens/settings.js';

describe('renderSettings', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    (global as any).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        id: 'test-id',
        getManifest: vi.fn(() => ({ version: '0.1.0', name: 'Paperwall' })),
        getURL: vi.fn((p: string) => `chrome-extension://test-id/${p}`),
      },
      storage: { local: { get: vi.fn(), set: vi.fn() }, session: { get: vi.fn(), set: vi.fn() } },
      tabs: { sendMessage: vi.fn(), create: vi.fn() },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    };
  });

  it('renders wallet address truncated', () => {
    renderSettings(container, '0xAbCd1234567890abcdef1234567890abcdef1234');
    expect(container.textContent).toContain('0xAbCd');
  });

  it('renders Export, Import, Create New buttons', () => {
    renderSettings(container, '0xABC');
    const text = container.textContent ?? '';
    expect(text).toContain('Export');
    expect(text).toContain('Import');
    expect(text).toContain('Create New');
  });

  it('clicking Export shows risk warning panel', () => {
    renderSettings(container, '0xABC');
    const exportBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Export'));
    exportBtn?.click();
    expect(container.querySelector('.warning-panel')).not.toBeNull();
  });

  it('clicking Import shows destructive warning with disabled proceed button', () => {
    renderSettings(container, '0xABC');
    const importBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Import'));
    importBtn?.click();
    const proceedBtn = container.querySelector('.destructive-proceed-btn') as HTMLButtonElement | null;
    expect(proceedBtn).not.toBeNull();
    expect(proceedBtn?.disabled).toBe(true);
  });

  it('checking the confirmation checkbox enables the proceed button', () => {
    renderSettings(container, '0xABC');
    const importBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Import'));
    importBtn?.click();
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    const proceedBtn = container.querySelector('.destructive-proceed-btn') as HTMLButtonElement;
    expect(proceedBtn.disabled).toBe(false);
  });

  it('about section shows version from manifest', () => {
    renderSettings(container, '0xABC');
    expect(container.textContent).toContain('0.1.0');
  });

  it('export step 2: clicking Continue on warning shows password input', () => {
    renderSettings(container, '0xABC');
    const exportBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Export Private Key',
    );
    exportBtn?.click();
    const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue'),
    );
    continueBtn?.click();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('export step 3: correct password reveals private key', async () => {
    (chrome.runtime.sendMessage as any).mockResolvedValue({
      success: true,
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    });

    renderSettings(container, '0xABC');
    const exportBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Export Private Key',
    );
    exportBtn?.click();
    const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Continue'),
    );
    continueBtn?.click();

    const pwInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    pwInput.value = 'correct-password';

    const form = container.querySelector('form.settings-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Wait for async sendMessage to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(container.querySelector('.export-key-display')).not.toBeNull();
  });

  it('import form: password mismatch shows inline error', () => {
    renderSettings(container, '0xABC');
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Import Private Key',
    );
    importBtn?.click();
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    const proceedBtn = container.querySelector('.destructive-proceed-btn') as HTMLButtonElement;
    proceedBtn.click();

    // Now the import form should be rendered — fill mismatched passwords
    const passInputs = Array.from(container.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
    expect(passInputs.length).toBeGreaterThanOrEqual(2);
    passInputs[0]!.value = 'password1';
    passInputs[1]!.value = 'password2';

    const form = container.querySelector('form.settings-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(container.textContent).toContain('Passwords do not match.');
  });
});
