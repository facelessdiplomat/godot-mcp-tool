import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { createMcpServer } from '../../src/server/createMcpServer.js';
import { textResult } from '../../src/tools/results.js';
import type { McpPrompt } from '../../src/prompts/McpPrompt.js';
import type { McpResource } from '../../src/resources/McpResource.js';
import type { Tool, ToolDefinition } from '../../src/tools/Tool.js';

const echoSchema = z.object({ text: z.string().describe('Text to return') });

class EchoTool implements Tool<typeof echoSchema> {
  readonly name = 'echo_text';
  readonly definition: ToolDefinition<typeof echoSchema> = {
    title: 'Echo text',
    description: 'Returns the given text.',
    inputSchema: echoSchema,
    annotations: { readOnlyHint: true },
    alwaysLoad: true,
  };

  execute(input: z.infer<typeof echoSchema>): Promise<CallToolResult> {
    return Promise.resolve(textResult(input.text));
  }
}

class ConfirmedEchoTool implements Tool<typeof echoSchema> {
  readonly name = 'echo_confirmed';
  readonly definition: ToolDefinition<typeof echoSchema> = {
    title: 'Echo after confirmation',
    description: 'Returns the given text once the user confirms the call.',
    inputSchema: echoSchema,
    annotations: { readOnlyHint: false },
    alwaysLoad: false,
    requiresUserInteraction: true,
  };

  execute(input: z.infer<typeof echoSchema>): Promise<CallToolResult> {
    return Promise.resolve(textResult(input.text));
  }
}

describe('createMcpServer', () => {
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  async function connectClient(): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer({
      name: 'godot',
      version: '0.1.0',
      instructions: 'Use these tools.',
      tools: [new EchoTool()],
    });
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    return client;
  }

  it('lists the tools with their annotations and the always-load hint', async () => {
    const connected = await connectClient();

    const { tools } = await connected.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'echo_text',
      title: 'Echo text',
      description: 'Returns the given text.',
      annotations: { readOnlyHint: true },
      _meta: { 'anthropic/alwaysLoad': true },
    });
  });

  it('asks the client to confirm every call of a tool that needs it', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer({ name: 'godot', version: '0.1.0', instructions: 'Use these tools.', tools: [new ConfirmedEchoTool()] });
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    expect(tools[0]?._meta).toEqual({ 'anthropic/requiresUserInteraction': true });
  });

  it('lists and reads resources, the concrete ones of a template included', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const scenes: McpResource = {
      definition: { name: 'scene', uri: 'godot://scene/{+path}', title: 'Scene tree', description: 'The node tree of a scene.' },
      read: (variables) => Promise.resolve(`tree of ${variables['path'] ?? ''}`),
      list: () => [{ uri: 'godot://scene/levels/arena.tscn', name: 'res://levels/arena.tscn' }],
    };
    const project: McpResource = {
      definition: { name: 'project', uri: 'godot://project', title: 'Project overview', description: 'The project.' },
      read: () => Promise.resolve('Project: Arena'),
    };
    const server = createMcpServer({ name: 'godot', version: '0.1.0', instructions: 'Use these tools.', tools: [], resources: [project, scenes] });
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    const listed = await client.listResources();
    const templates = await client.listResourceTemplates();
    const tree = await client.readResource({ uri: 'godot://scene/levels/arena.tscn' });
    const overview = await client.readResource({ uri: 'godot://project' });

    expect(listed.resources.map((resource) => resource.uri)).toEqual(['godot://project', 'godot://scene/levels/arena.tscn']);
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toEqual(['godot://scene/{+path}']);
    expect(tree.contents).toEqual([{ uri: 'godot://scene/levels/arena.tscn', mimeType: 'text/plain', text: 'tree of levels/arena.tscn' }]);
    expect(overview.contents[0]).toMatchObject({ text: 'Project: Arena' });
  });

  it('gets prompts with their arguments', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const sceneArgs = z.object({ scene: z.string().optional().describe('The scene to look at.') });
    const prompt: McpPrompt<typeof sceneArgs> = {
      name: 'look',
      definition: { title: 'Look', description: 'Look at a scene.', argsSchema: sceneArgs },
      render: (args) => Promise.resolve(`Look at ${args.scene ?? 'the main scene'}.`),
    };
    const server = createMcpServer({ name: 'godot', version: '0.1.0', instructions: 'Use these tools.', tools: [], prompts: [prompt] });
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    const { prompts } = await client.listPrompts();
    const result = await client.getPrompt({ name: 'look', arguments: { scene: 'res://arena.tscn' } });

    expect(prompts[0]).toMatchObject({ name: 'look', title: 'Look', description: 'Look at a scene.', arguments: [{ name: 'scene', required: false }] });
    expect(result.messages).toEqual([{ role: 'user', content: { type: 'text', text: 'Look at res://arena.tscn.' } }]);
  });

  it('calls a tool', async () => {
    const connected = await connectClient();

    const result = await connected.callTool({ name: 'echo_text', arguments: { text: 'hello' } });

    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('reports invalid arguments as a tool error', async () => {
    const connected = await connectClient();

    const result = await connected.callTool({ name: 'echo_text', arguments: {} });

    expect(result.isError).toBe(true);
  });

  it('passes the server instructions to the client', async () => {
    const connected = await connectClient();

    expect(connected.getInstructions()).toBe('Use these tools.');
  });
});
