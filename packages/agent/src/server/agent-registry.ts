import { readJsonFile, writeJsonFile } from '../storage.js';

const AGENTS_FILENAME = 'agents.json';

interface AgentRecord {
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly requestCount: number;
}

type AgentStore = Record<string, AgentRecord>;

// --- Public API ---

export interface AgentActivity {
  readonly firstSeen: string;
  readonly requestCount: number;
}

/**
 * Records a request from an agent and returns activity stats.
 * Creates a new record if this is the first time seeing the agent.
 */
export function recordAgentRequest(agentId: string | null): AgentActivity | null {
  if (!agentId) {
    return null;
  }

  const now = new Date().toISOString();
  const store = readJsonFile<AgentStore>(AGENTS_FILENAME) ?? {};

  const existing = store[agentId];

  const updated: AgentRecord = existing
    ? { firstSeen: existing.firstSeen, lastSeen: now, requestCount: existing.requestCount + 1 }
    : { firstSeen: now, lastSeen: now, requestCount: 1 };

  try {
    writeJsonFile(AGENTS_FILENAME, { ...store, [agentId]: updated });
  } catch (error: unknown) {
    console.error(
      `[paperwall] Warning: failed to update agent record: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    firstSeen: updated.firstSeen,
    requestCount: updated.requestCount,
  };
}

/**
 * Gets the most recent activity for an agent.
 * Returns null if agent has never been seen.
 */
export function getAgentActivity(agentId: string): AgentActivity | null {
  const store = readJsonFile<AgentStore>(AGENTS_FILENAME) ?? {};
  const record = store[agentId];

  if (!record) {
    return null;
  }

  return {
    firstSeen: record.firstSeen,
    requestCount: record.requestCount,
  };
}
