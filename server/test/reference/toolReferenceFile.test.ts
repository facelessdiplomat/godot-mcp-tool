import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/createApplication.js';
import { renderToolReference, type ServerListing } from './toolReference.js';

async function listServer(): Promise<ServerListing> {
  const application = createApplication({
    variables: { GODOT_MCP_UNSAFE: '1' },
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

describe('docs/tools.md', () => {
  it('shows every tool, prompt and resource of the server as it is now, so run npm run docs:tools after changing one', async () => {
    await expect(renderToolReference(await listServer())).toMatchFileSnapshot('../../../docs/tools.md');
  });
});
