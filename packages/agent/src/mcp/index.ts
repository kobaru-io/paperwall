import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { log } from '../logger.js';

// -- Public API ---

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'paperwall',
    version: '0.1.0',
  });

  registerTools(server);
  registerResources(server);

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  log('MCP server starting on stdio...');
  await server.connect(transport);
}
