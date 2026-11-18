import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Application, createApplication } from '../../src/createApplication.js';

const repositoryAddon = join(import.meta.dirname, '..', '..', '..', 'addon', 'addons', 'godot_mcp_tool');

describe('a server started in a folder without a project', () => {
  let workspace: string;
  let application: Application | undefined;
  let client: Client | undefined;

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'project-following-')));
  });

  afterEach(async () => {
    await client?.close();
    application?.shutdown();
    rmSync(workspace, { recursive: true, force: true });
  });

  async function connected(): Promise<Client> {
    application = createApplication({ variables: {}, workingDirectory: workspace, platform: process.platform, homeDirectory: workspace, bundledAddonDirectory: repositoryAddon });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await application.createMcpServer().connect(serverTransport);
    client = new Client({ name: 'project-following-test', version: '1.0.0' });
    await client.connect(clientTransport);
    return client;
  }

  async function textOf(session: Client, name: string, toolArguments: Record<string, unknown> = {}): Promise<string> {
    const result = await session.callTool({ name, arguments: toolArguments });
    const [content] = result.content;
    return content?.type === 'text' ? content.text : '';
  }

  it('works on the project that project_create made, without a restart', async () => {
    const session = await connected();

    const before = await textOf(session, 'godot_status');
    const created = await textOf(session, 'project_create', { path: 'capsule-walk' });
    const after = await textOf(session, 'godot_status');

    expect(before).toContain('Project: not found.');
    expect(before).toContain('project_create');
    expect(created).toContain(`Created the Godot project "Capsule Walk" in ${join(workspace, 'capsule-walk')}`);
    expect(created).toContain('The server now works on this project');
    expect(after).toContain(`Project: ${join(workspace, 'capsule-walk')} (from project_create)`);
  });
});
