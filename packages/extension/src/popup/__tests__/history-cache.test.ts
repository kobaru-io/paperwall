import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('history-cache', () => {
  beforeEach(() => {
    vi.resetModules();
    (global as any).chrome = {
      runtime: { sendMessage: vi.fn(), id: 'test-extension-id' },
      storage: { local: { get: vi.fn(), set: vi.fn() }, session: { get: vi.fn(), set: vi.fn() } },
      tabs: { sendMessage: vi.fn() },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    };
  });

  it('sends GET_HISTORY on first call and returns records', async () => {
    const { loadHistoryCache, clearHistoryCache } = await import('../history-cache.js');
    clearHistoryCache();
    const mockRecords = [{ requestId: '1', origin: 'example.com', timestamp: Date.now() }];
    (chrome.runtime.sendMessage as any).mockResolvedValue({ success: true, records: mockRecords });

    const result = await loadHistoryCache();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_HISTORY', limit: 1000, offset: 0 });
    expect(result).toEqual(mockRecords);
  });

  it('returns cached result without re-sending on second call', async () => {
    const { loadHistoryCache, clearHistoryCache } = await import('../history-cache.js');
    clearHistoryCache();
    (chrome.runtime.sendMessage as any).mockResolvedValue({ success: true, records: [] });

    await loadHistoryCache();
    await loadHistoryCache();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when GET_HISTORY fails', async () => {
    const { loadHistoryCache, clearHistoryCache } = await import('../history-cache.js');
    clearHistoryCache();
    (chrome.runtime.sendMessage as any).mockResolvedValue({ success: false, error: 'Storage error' });

    const result = await loadHistoryCache();
    expect(result).toEqual([]);
  });

  it('re-fetches after clearHistoryCache()', async () => {
    const { loadHistoryCache, clearHistoryCache } = await import('../history-cache.js');
    clearHistoryCache();
    (chrome.runtime.sendMessage as any).mockResolvedValue({ success: true, records: [] });

    await loadHistoryCache();
    clearHistoryCache();
    await loadHistoryCache();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers share a single in-flight request', async () => {
    const { loadHistoryCache, clearHistoryCache } = await import('../history-cache.js');
    clearHistoryCache();
    (chrome.runtime.sendMessage as any).mockResolvedValue({ success: true, records: [] });

    await Promise.all([loadHistoryCache(), loadHistoryCache(), loadHistoryCache()]);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when sendMessage throws', async () => {
    const { loadHistoryCache, clearHistoryCache } = await import('../history-cache.js');
    clearHistoryCache();
    (chrome.runtime.sendMessage as any).mockRejectedValue(new Error('Extension context invalid'));

    const result = await loadHistoryCache();
    expect(result).toEqual([]);
  });
});
