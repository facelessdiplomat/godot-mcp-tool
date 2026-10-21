import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { createMcpServer } from '../../src/server/createMcpServer.js';
import { textResult } from '../../src/tools/results.js';
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
