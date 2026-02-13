import { appendJsonlFile, readJsonlFile } from '../storage.js';

const AGENTS_FILENAME = 'agents.jsonl';

interface AgentRecord {
  readonly agentId: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly requestCount: number;
}

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
  const records = readJsonlFile<AgentRecord>(AGENTS_FILENAME);

  // Find the most recent record for this agent (last one wins in JSONL)
  let existing: AgentRecord | undefined;
  for (const record of records) {
    if (record.agentId === agentId) {
      existing = record;
    }
  }

  if (existing) {
    // Update existing record
    const updated: AgentRecord = {
      agentId,
      firstSeen: existing.firstSeen,
      lastSeen: now,
      requestCount: existing.requestCount + 1,
    };

    // Append updated record (JSONL is append-only, latest record wins)
    try {
      appendJsonlFile(AGENTS_FILENAME, updated);
    } catch (error: unknown) {
      console.error(
        `[paperwall] Warning: failed to update agent record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      firstSeen: existing.firstSeen,
      requestCount: updated.requestCount,
    };
  } else {
    // Create new record
    const newRecord: AgentRecord = {
      agentId,
      firstSeen: now,
      lastSeen: now,
      requestCount: 1,
    };

    try {
      appendJsonlFile(AGENTS_FILENAME, newRecord);
    } catch (error: unknown) {
      console.error(
        `[paperwall] Warning: failed to create agent record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      firstSeen: now,
      requestCount: 1,
    };
  }
}

/**
 * Gets the most recent activity for an agent.
 * Returns null if agent has never been seen.
 */
export function getAgentActivity(agentId: string): AgentActivity | null {
  const records = readJsonlFile<AgentRecord>(AGENTS_FILENAME);

  // Find the most recent record for this agent (last one wins)
  let latest: AgentRecord | undefined;
  for (const record of records) {
    if (record.agentId === agentId) {
      latest = record;
    }
  }

  if (!latest) {
    return null;
  }

  return {
    firstSeen: latest.firstSeen,
    requestCount: latest.requestCount,
  };
}
