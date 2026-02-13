import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../request-orchestrator.js', () => ({
  orchestrateFetch: vi.fn(),
}));

import { PaperwallExecutor } from '../executor.js';
import { orchestrateFetch } from '../request-orchestrator.js';
import type { RequestContext, ExecutionEventBus, AgentExecutionEvent } from '@a2a-js/sdk/server';
import type { Message, Task } from '@a2a-js/sdk';

const mockOrchestrate = vi.mocked(orchestrateFetch);

function createMockEventBus(): ExecutionEventBus & {
  published: AgentExecutionEvent[];
  didFinish: boolean;
} {
  const published: AgentExecutionEvent[] = [];
  return {
    published,
    didFinish: false,
    publish(event: AgentExecutionEvent) {
      published.push(event);
    },
    finished() {
      (this as { didFinish: boolean }).didFinish = true;
    },
  } as ExecutionEventBus & { published: AgentExecutionEvent[]; didFinish: boolean };
}

function createContext(message: Message): RequestContext {
  return {
    taskId: 'task-1',
    contextId: 'ctx-1',
    task: {
      id: 'task-1',
      status: { state: 'submitted', timestamp: new Date().toISOString() },
      history: [message],
    },
    userMessage: message,
    isCancelled: () => false,
  } as RequestContext;
}

function getTaskMessage(bus: { published: AgentExecutionEvent[] }): Message {
  const task = bus.published[0] as Task;
  return task.history!.at(-1) as Message;
}

describe('PaperwallExecutor', () => {
  const executor = new PaperwallExecutor({ authTtl: 300 });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes error when url is missing', async () => {
    const message: Message = {
      kind: 'message',
      messageId: 'msg-1',
      role: 'user',
      parts: [{ kind: 'text', text: 'hello' }],
    };
    const ctx = createContext(message);
    const bus = createMockEventBus();

    await executor.execute(ctx, bus);

    expect(bus.published).toHaveLength(1);
    const msg = getTaskMessage(bus);
    expect(msg.parts[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('url parameter is required'),
    });
    expect((bus.published[0] as Task).status.state).toBe('failed');
    expect(bus.didFinish).toBe(true);
  });

  it('extracts url from data part and calls orchestrateFetch', async () => {
    mockOrchestrate.mockResolvedValueOnce({
      ok: true,
      content: '<html>content</html>',
      contentType: 'text/html',
      payment: null,
      receipt: {
        id: 'r-1',
        timestamp: '2026-02-11T00:00:00Z',
        ap2Stage: 'intent',
        url: 'https://example.com',
        agentId: 'a1',
        authorization: {
          perRequestLimit: null,
          dailyLimit: null,
          totalLimit: null,
          dailySpent: '0',
          totalSpent: '0',
          requestedAmount: '0',
          authorizedAt: '2026-02-11T00:00:00Z',
          expiresAt: null,
        },
        settlement: null,
        decline: null,
        verification: null,
        riskSignals: {
          requestSource: 'a2a-rpc',
          timestamp: '2026-02-11T00:00:00Z',
          agentFirstSeen: null,
          agentRequestCount: 0,
        },
      },
    });

    const message: Message = {
      kind: 'message',
      messageId: 'msg-2',
      role: 'user',
      parts: [
        {
          kind: 'data',
          data: {
            url: 'https://example.com',
            maxPrice: '0.10',
            agentId: 'a1',
          },
        },
      ],
    };
    const ctx = createContext(message);
    const bus = createMockEventBus();

    await executor.execute(ctx, bus);

    expect(mockOrchestrate).toHaveBeenCalledWith({
      url: 'https://example.com',
      maxPrice: '0.10',
      agentId: 'a1',
      requestSource: 'a2a-rpc',
      authTtl: 300,
    });
    expect(bus.published).toHaveLength(1);
    expect(bus.didFinish).toBe(true);
  });

  it('extracts url from text part as fallback', async () => {
    mockOrchestrate.mockResolvedValueOnce({
      ok: true,
      content: 'content',
      contentType: 'text/plain',
      payment: null,
      receipt: {
        id: 'r-2',
        timestamp: '2026-02-11T00:00:00Z',
        ap2Stage: 'intent',
        url: 'https://example.com/article',
        agentId: null,
        authorization: {
          perRequestLimit: null,
          dailyLimit: null,
          totalLimit: null,
          dailySpent: '0',
          totalSpent: '0',
          requestedAmount: '0',
          authorizedAt: '2026-02-11T00:00:00Z',
          expiresAt: null,
        },
        settlement: null,
        decline: null,
        verification: null,
        riskSignals: {
          requestSource: 'a2a-rpc',
          timestamp: '2026-02-11T00:00:00Z',
          agentFirstSeen: null,
          agentRequestCount: 0,
        },
      },
    });

    const message: Message = {
      kind: 'message',
      messageId: 'msg-3',
      role: 'user',
      parts: [
        { kind: 'text', text: 'fetch https://example.com/article please' },
      ],
    };
    const ctx = createContext(message);
    const bus = createMockEventBus();

    await executor.execute(ctx, bus);

    expect(mockOrchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/article' }),
    );
    expect(bus.didFinish).toBe(true);
  });

  it('handles orchestrateFetch throwing an error', async () => {
    mockOrchestrate.mockRejectedValueOnce(new Error('network failure'));

    const message: Message = {
      kind: 'message',
      messageId: 'msg-4',
      role: 'user',
      parts: [
        { kind: 'data', data: { url: 'https://example.com' } },
      ],
    };
    const ctx = createContext(message);
    const bus = createMockEventBus();

    await executor.execute(ctx, bus);

    expect(bus.published).toHaveLength(1);
    const msg = getTaskMessage(bus);
    expect(msg.parts[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('network failure'),
    });
    expect((bus.published[0] as Task).status.state).toBe('failed');
    expect(bus.didFinish).toBe(true);
  });

  it('cancelTask calls finished on event bus', async () => {
    const bus = createMockEventBus();
    await executor.cancelTask('task-1', bus);
    expect(bus.didFinish).toBe(true);
  });
});
