import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/createApplication.js';
import { serverInstructions } from '../../src/server/serverInstructions.js';

async function registeredToolNames(): Promise<string[]> {
  const application = createApplication({ variables: {}, workingDirectory: '/nonexistent', platform: process.platform, homeDirectory: '/nonexistent' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await application.createMcpServer().connect(serverTransport);
  const client = new Client({ name: 'instructions-test', version: '1.0.0' });
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  } finally {
    await client.close();
    application.shutdown();
  }
}

describe('serverInstructions', () => {
  it('fits in what Claude Code loads at startup', () => {
    expect(serverInstructions.length).toBeLessThan(4096);
  });

  it('names only tools that exist', async () => {
    const toolNames = await registeredToolNames();
    const mentionedTools = serverInstructions.match(/\b(?:godot|project|editor|scene|node|game|docs|signal|script|input)_[a-z_]+\b/g) ?? [];

    expect(mentionedTools.length).toBeGreaterThan(5);
    for (const toolName of mentionedTools) {
      expect(toolNames).toContain(toolName);
    }
  });

  it('passes the instructions to the client', async () => {
    const application = createApplication({ variables: {}, workingDirectory: '/nonexistent', platform: process.platform, homeDirectory: '/nonexistent' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await application.createMcpServer().connect(serverTransport);
    const client = new Client({ name: 'instructions-test', version: '1.0.0' });
    await client.connect(clientTransport);

    expect(client.getInstructions()).toBe(serverInstructions);

    await client.close();
    application.shutdown();
  });
});
