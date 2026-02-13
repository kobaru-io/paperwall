import type {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import type { Message, Task, TaskState } from '@a2a-js/sdk';
import { orchestrateFetch } from './request-orchestrator.js';

export interface PaperwallExecutorOptions {
  readonly authTtl: number;
}

export class PaperwallExecutor implements AgentExecutor {
  private readonly authTtl: number;

  constructor(options: PaperwallExecutorOptions) {
    this.authTtl = options.authTtl;
  }

  async execute(
    context: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const params = extractParams(context.userMessage);

    if (!params.url) {
      this.publishTask(context, eventBus, 'failed', {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'agent',
        parts: [{ kind: 'text', text: 'Error: url parameter is required' }],
      });
      return;
    }

    try {
      const result = await orchestrateFetch({
        url: params.url,
        maxPrice: params.maxPrice,
        agentId: params.agentId,
        requestSource: 'a2a-rpc',
        authTtl: this.authTtl,
      });

      const responseData = result.ok
        ? {
            ok: true,
            url: params.url,
            content: result.content,
            contentType: result.contentType,
            payment: result.payment,
            receipt: result.receipt,
          }
        : {
            ok: false,
            url: params.url,
            error: result.error,
            message: result.message,
            receipt: result.receipt,
          };

      const responseMsg: Message = {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'agent',
        parts: [
          { kind: 'data', data: responseData },
          {
            kind: 'text',
            text: result.ok
              ? `Successfully fetched ${params.url}${result.payment ? ` (paid ${result.payment.amountFormatted} USDC)` : ' (free)'}`
              : `Failed to fetch ${params.url}: ${result.message}`,
          },
        ],
      };

      this.publishTask(context, eventBus, 'completed', responseMsg);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.publishTask(context, eventBus, 'failed', {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'agent',
        parts: [
          { kind: 'text', text: `Internal error: ${message}` },
        ],
      });
    }
  }

  // -- Internal Helpers ---

  private publishTask(
    context: RequestContext,
    eventBus: ExecutionEventBus,
    state: TaskState,
    responseMsg: Message,
  ): void {
    const task: Task = {
      kind: 'task',
      id: context.taskId,
      contextId: context.contextId,
      status: {
        state,
        message: responseMsg,
        timestamp: new Date().toISOString(),
      },
      history: [responseMsg],
    };
    eventBus.publish(task);
    eventBus.finished();
  }

  async cancelTask(
    _taskId: string,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    eventBus.finished();
  }
}

function extractParams(message: Message): {
  url: string | null;
  maxPrice: string | undefined;
  agentId: string | null;
} {
  // Try data part first (structured input)
  for (const part of message.parts) {
    if (part.kind === 'data') {
      const data = part.data as Record<string, unknown>;
      return {
        url: typeof data['url'] === 'string' ? data['url'] : null,
        maxPrice:
          typeof data['maxPrice'] === 'string'
            ? data['maxPrice']
            : undefined,
        agentId:
          typeof data['agentId'] === 'string' ? data['agentId'] : null,
      };
    }
  }

  // Fallback: extract URL from text part
  for (const part of message.parts) {
    if (part.kind === 'text') {
      const urlMatch = part.text.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        return { url: urlMatch[0], maxPrice: undefined, agentId: null };
      }
    }
  }

  return { url: null, maxPrice: undefined, agentId: null };
}
