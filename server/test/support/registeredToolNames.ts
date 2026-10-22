import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createApplication } from '../../src/createApplication.js';

export async function registeredToolNames(): Promise<string[]> {
  const application = createApplication({ variables: {}, workingDirectory: '/nonexistent', platform: process.platform, homeDirectory: '/nonexistent' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await application.createMcpServer().connect(serverTransport);
  const client = new Client({ name: 'tool-list-test', version: '1.0.0' });
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  } finally {
    await client.close();
    application.shutdown();
  }
}
