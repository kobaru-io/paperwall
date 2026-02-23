// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderTabBar } from '../components/tab-bar.js';

describe('renderTabBar', () => {
  let container: HTMLElement;
  let onTabChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    onTabChange = vi.fn();
    (global as any).chrome = {
      runtime: { getURL: vi.fn((p: string) => `chrome-extension://test/${p}`), id: 'test-id' },
      tabs: { create: vi.fn() },
      storage: { local: { get: vi.fn(), set: vi.fn() }, session: { get: vi.fn(), set: vi.fn() } },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    };
  });

  it('renders 4 tab buttons', () => {
    renderTabBar(container, 'dashboard', onTabChange);
    const buttons = container.querySelectorAll('button[data-tab]');
    expect(buttons).toHaveLength(4);
  });

  it('marks the active tab with active class', () => {
    renderTabBar(container, 'history', onTabChange);
    const activeBtn = container.querySelector('button[data-tab="history"]');
    expect(activeBtn?.className).toContain('tab-button--active');
  });

  it('clicking a tab calls onTabChange with correct tab name', () => {
    renderTabBar(container, 'dashboard', onTabChange);
    const statsBtn = container.querySelector('button[data-tab="stats"]') as HTMLButtonElement;
    statsBtn.click();
    expect(onTabChange).toHaveBeenCalledWith('stats');
  });

  it('renders open-in-tab button', () => {
    renderTabBar(container, 'dashboard', onTabChange);
    expect(container.querySelector('.open-in-tab-btn')).not.toBeNull();
  });

  it('non-active tabs do not have active class', () => {
    renderTabBar(container, 'dashboard', onTabChange);
    const historyBtn = container.querySelector('button[data-tab="history"]');
    expect(historyBtn?.className).not.toContain('tab-button--active');
  });
});
