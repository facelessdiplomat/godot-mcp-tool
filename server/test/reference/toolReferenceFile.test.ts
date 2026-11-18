import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/createApplication.js';
import { renderToolReference, type ServerListing } from './toolReference.js';

async function listServer(variables: Readonly<Record<string, string>>): Promise<Omit<ServerListing, 'unsafeToolNames'>> {
  const application = createApplication({
    variables,
    workingDirectory: '/nonexistent',
    platform: 'linux',
    homeDirectory: '/nonexistent',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await application.createMcpServer().connect(serverTransport);
  const client = new Client({ name: 'tool-reference', version: '1.0.0' });
  await client.connect(clientTransport);
  try {
    const [{ tools }, { prompts }, { resources }, { resourceTemplates }] = await Promise.all([
      client.listTools(),
      client.listPrompts(),
      client.listResources(),
      client.listResourceTemplates(),
    ]);
    return { tools, prompts, resources, resourceTemplates };
  } finally {
    await client.close();
    application.shutdown();
  }
}

async function listEveryTool(): Promise<ServerListing> {
  const withUnsafeTools = await listServer({ GODOT_MCP_UNSAFE: '1' });
  const byDefault = new Set((await listServer({})).tools.map((tool) => tool.name));
  return { ...withUnsafeTools, unsafeToolNames: withUnsafeTools.tools.map((tool) => tool.name).filter((name) => !byDefault.has(name)) };
}

describe('docs/tools.md', () => {
  it('shows every tool, prompt and resource of the server as it is now, so run npm run docs:tools after changing one', async () => {
    await expect(renderToolReference(await listEveryTool())).toMatchFileSnapshot('../../../docs/tools.md');
  });
});
