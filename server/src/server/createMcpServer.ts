import { McpServer } from '@modelcontextprotocol/server';
import type { Tool } from '../tools/Tool.js';

export interface McpServerSettings {
  readonly name: string;
  readonly version: string;
  readonly instructions: string;
  readonly tools: readonly Tool[];
}

export function createMcpServer(settings: McpServerSettings): McpServer {
  const server = new McpServer({ name: settings.name, version: settings.version }, { instructions: settings.instructions });
  for (const tool of settings.tools) {
    registerTool(server, tool);
  }
  return server;
}

function registerTool(server: McpServer, tool: Tool): void {
  const { title, description, inputSchema, annotations, alwaysLoad } = tool.definition;
  server.registerTool(
    tool.name,
    {
      title,
      description,
      inputSchema,
      annotations,
      ...(alwaysLoad ? { _meta: { 'anthropic/alwaysLoad': true } } : {}),
    },
    (input) => tool.execute(input),
  );
}
