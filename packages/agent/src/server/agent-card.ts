import type { AgentCard } from '@a2a-js/sdk';

interface AgentCardOptions {
  readonly url: string;
  readonly networks: string[];
}

export function buildAgentCard(options: AgentCardOptions): AgentCard {
  return {
    protocol: 'A2A',
    name: 'Paperwall Agent',
    description:
      'Fetches x402-paywalled web content with automatic cryptocurrency micropayments. Supports both HTTP 402 and Paperwall meta tag payment signals.',
    protocolVersion: '0.3.0',
    version: '0.1.0',
    url: `${options.url}/rpc`,
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'fetch-content',
        name: 'Fetch Paywalled Content',
        description:
          'Fetch a URL and automatically handle payment if the content is paywalled. Returns the content along with a structured AP2 payment receipt.',
        tags: ['x402', 'payment', 'fetch', 'paywall', 'content'],
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
  };
}
