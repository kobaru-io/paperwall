import { describe, it, expect } from 'vitest';
import { buildAgentCard } from '../agent-card.js';

describe('buildAgentCard', () => {
  it('returns valid Agent Card with required fields', () => {
    const card = buildAgentCard({
      url: 'http://localhost:4000',
      networks: ['eip155:324705682'],
    });

    expect(card.name).toBe('Paperwall Agent');
    expect(card.protocolVersion).toBe('0.3.0');
    expect(card.url).toBe('http://localhost:4000/rpc');
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]!.id).toBe('fetch-content');
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it('includes fetch-content skill with tags', () => {
    const card = buildAgentCard({
      url: 'http://localhost:4000',
      networks: ['eip155:324705682', 'eip155:1187947933'],
    });

    expect(card.skills[0]!.tags).toContain('x402');
    expect(card.skills[0]!.tags).toContain('payment');
    expect(card.skills[0]!.tags).toContain('fetch');
  });

  it('includes defaultInputModes and defaultOutputModes', () => {
    const card = buildAgentCard({
      url: 'http://localhost:4000',
      networks: ['eip155:324705682'],
    });

    expect(card.defaultInputModes).toContain('application/json');
    expect(card.defaultOutputModes).toContain('application/json');
  });
});
