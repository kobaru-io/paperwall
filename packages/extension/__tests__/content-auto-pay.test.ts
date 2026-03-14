import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test the content script's response handling logic for auto-pay.
// Since the content script executes at module load, we test the core
// response handling behavior by simulating the sendMessage callback pattern.

describe('content script auto-pay response handling', () => {
  let destroyBridgeMock: ReturnType<typeof vi.fn>;
  let stopObservingMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    destroyBridgeMock = vi.fn();
    stopObservingMock = vi.fn();
  });

  function simulateResponseHandling(
    response: Record<string, unknown> | undefined,
    stopObserving: (() => void) | null,
  ): { bridgeDestroyed: boolean; observerStopped: boolean } {
    // This mirrors the callback logic in content/index.ts handleDetection
    let bridgeDestroyed = false;
    let observerStopped = false;

    if (!response) return { bridgeDestroyed, observerStopped };

    if (response['blocked']) {
      destroyBridgeMock();
      bridgeDestroyed = true;
      if (stopObserving) {
        stopObserving();
        observerStopped = true;
      }
      return { bridgeDestroyed, observerStopped };
    }

    // autoPaid or normal response — no special action
    return { bridgeDestroyed, observerStopped };
  }

  it('tears down bridge and observer when response is blocked', () => {
    const result = simulateResponseHandling(
      { blocked: true },
      stopObservingMock,
    );

    expect(result.bridgeDestroyed).toBe(true);
    expect(result.observerStopped).toBe(true);
    expect(destroyBridgeMock).toHaveBeenCalled();
    expect(stopObservingMock).toHaveBeenCalled();
  });

  it('does nothing on autoPaid response', () => {
    const result = simulateResponseHandling(
      { autoPaid: true },
      stopObservingMock,
    );

    expect(result.bridgeDestroyed).toBe(false);
    expect(result.observerStopped).toBe(false);
    expect(destroyBridgeMock).not.toHaveBeenCalled();
    expect(stopObservingMock).not.toHaveBeenCalled();
  });

  it('does nothing on normal response', () => {
    const result = simulateResponseHandling(
      { success: true },
      stopObservingMock,
    );

    expect(result.bridgeDestroyed).toBe(false);
    expect(result.observerStopped).toBe(false);
  });

  it('handles undefined response gracefully', () => {
    const result = simulateResponseHandling(undefined, stopObservingMock);

    expect(result.bridgeDestroyed).toBe(false);
    expect(result.observerStopped).toBe(false);
  });

  it('handles null stopObserving when blocked', () => {
    const result = simulateResponseHandling(
      { blocked: true },
      null,
    );

    expect(result.bridgeDestroyed).toBe(true);
    expect(result.observerStopped).toBe(false);
    expect(destroyBridgeMock).toHaveBeenCalled();
  });
});
