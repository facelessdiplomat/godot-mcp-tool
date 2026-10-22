import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { McpPrompt } from '../prompts/McpPrompt.js';
import type { McpResource, ResourceVariables } from '../resources/McpResource.js';
import type { Tool } from '../tools/Tool.js';

export interface McpServerSettings {
  readonly name: string;
  readonly version: string;
  readonly instructions: string;
  readonly tools: readonly Tool[];
  readonly resources?: readonly McpResource[] | undefined;
  readonly prompts?: readonly McpPrompt[] | undefined;
}

const resourceMimeType = 'text/plain';

export function createMcpServer(settings: McpServerSettings): McpServer {
  const server = new McpServer({ name: settings.name, version: settings.version }, { instructions: settings.instructions });
  for (const tool of settings.tools) {
    registerTool(server, tool);
  }
  for (const resource of settings.resources ?? []) {
    registerResource(server, resource);
  }
  for (const prompt of settings.prompts ?? []) {
    registerPrompt(server, prompt);
  }
  return server;
}

function registerTool(server: McpServer, tool: Tool): void {
  const { title, description, inputSchema, annotations, alwaysLoad, requiresUserInteraction } = tool.definition;
  const meta = {
    ...(alwaysLoad ? { 'anthropic/alwaysLoad': true } : {}),
    ...(requiresUserInteraction === true ? { 'anthropic/requiresUserInteraction': true } : {}),
  };
  server.registerTool(
    tool.name,
    {
      title,
      description,
      inputSchema,
      annotations,
      ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
    },
    (input) => tool.execute(input),
  );
}

function registerResource(server: McpServer, resource: McpResource): void {
  const { name, uri, title, description } = resource.definition;
  const metadata = { title, description, mimeType: resourceMimeType };
  const contentsOf = async (requested: URL, variables: ResourceVariables): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> => ({
    contents: [{ uri: requested.href, mimeType: resourceMimeType, text: await resource.read(variables) }],
  });
  if (!uri.includes('{')) {
    server.registerResource(name, uri, metadata, (requested) => contentsOf(requested, {}));
    return;
  }
  const { list } = resource;
  const template = new ResourceTemplate(uri, {
    list: list === undefined ? undefined : () => ({ resources: list().map((listed) => ({ uri: listed.uri, name: listed.name, mimeType: resourceMimeType })) }),
  });
  server.registerResource(name, template, metadata, (requested, variables) => contentsOf(requested, singleValues(variables)));
}

function singleValues(variables: Readonly<Record<string, string | string[]>>): ResourceVariables {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, Array.isArray(value) ? value.join('/') : value]));
}

function registerPrompt(server: McpServer, prompt: McpPrompt): void {
  const { title, description, argsSchema } = prompt.definition;
  server.registerPrompt(prompt.name, { title, description, argsSchema }, async (args) => ({
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text: await prompt.render(args) } }],
  }));
}
