import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recordAgentRequest, getAgentActivity } from '../agent-registry.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('agent-registry', () => {
  const originalHome = process.env['HOME'];
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-test-'));
    process.env['HOME'] = testDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('recordAgentRequest', () => {
    it('returns null for null agentId', () => {
      const activity = recordAgentRequest(null);
      expect(activity).toBeNull();
    });

    it('creates new record for first request', () => {
      const activity = recordAgentRequest('agent-1');

      expect(activity).toBeDefined();
      expect(activity?.requestCount).toBe(1);
      expect(activity?.firstSeen).toBeDefined();
    });

    it('increments count for subsequent requests', () => {
      const first = recordAgentRequest('agent-1');
      const second = recordAgentRequest('agent-1');

      expect(first?.requestCount).toBe(1);
      expect(second?.requestCount).toBe(2);
      expect(second?.firstSeen).toBe(first?.firstSeen);
    });

    it('tracks multiple agents independently', () => {
      const agent1First = recordAgentRequest('agent-1');
      const agent2First = recordAgentRequest('agent-2');
      const agent1Second = recordAgentRequest('agent-1');

      expect(agent1First?.requestCount).toBe(1);
      expect(agent2First?.requestCount).toBe(1);
      expect(agent1Second?.requestCount).toBe(2);
    });
  });

  describe('getAgentActivity', () => {
    it('returns null for unknown agent', () => {
      const activity = getAgentActivity('unknown-agent');
      expect(activity).toBeNull();
    });

    it('returns activity for known agent', () => {
      recordAgentRequest('agent-1');
      recordAgentRequest('agent-1');

      const activity = getAgentActivity('agent-1');
      expect(activity?.requestCount).toBe(2);
      expect(activity?.firstSeen).toBeDefined();
    });

    it('returns latest count after multiple updates', () => {
      for (let i = 0; i < 5; i++) {
        recordAgentRequest('agent-1');
      }

      const activity = getAgentActivity('agent-1');
      expect(activity?.requestCount).toBe(5);
    });
  });
});
