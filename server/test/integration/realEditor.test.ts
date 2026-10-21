import { type ChildProcess, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BridgeClient } from '../../src/bridge/BridgeClient.js';
import { DiscoveryFileReader, isProcessAlive } from '../../src/bridge/DiscoveryFileReader.js';
import { type Application, createApplication } from '../../src/createApplication.js';

const godotBinary = process.env['GODOT_BIN'] ?? '';
const projectRoot = resolve(import.meta.dirname, '..', '..', '..', 'test-project');
const editorStartupTimeoutMs = 120_000;

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`The condition was not met within ${String(timeoutMs)} ms`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe.skipIf(godotBinary === '')('the MCP server with a real headless Godot editor', () => {
  const discovery = new DiscoveryFileReader(projectRoot, isProcessAlive);
  let editorProcess: ChildProcess | undefined;
  let application: Application | undefined;
  let client: Client | undefined;

  function editorPid(): number {
    return editorProcess?.pid ?? -1;
  }

  async function godotStatusText(): Promise<string> {
    if (client === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return textOf(await client.callTool({ name: 'godot_status', arguments: {} }));
  }

  beforeAll(async () => {
    editorProcess = spawn(godotBinary, ['--headless', '--editor', '--path', projectRoot], { stdio: 'ignore' });
    await waitFor(() => {
      const discovered = discovery.read();
      return discovered.kind === 'found' && discovered.endpoint.pid === editorPid();
    }, editorStartupTimeoutMs);

    application = createApplication({
      variables: { GODOT_PROJECT_PATH: projectRoot },
      workingDirectory: projectRoot,
      platform: process.platform,
      homeDirectory: homedir(),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await application.createMcpServer().connect(serverTransport);
    client = new Client({ name: 'integration-test', version: '1.0.0' });
    await client.connect(clientTransport);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await client?.close();
    application?.shutdown();
    editorProcess?.kill('SIGKILL');
  });

  it('reports the connected editor and finds the binary through it', async () => {
    const statusText = await godotStatusText();

    expect(statusText).toContain(`Project: ${projectRoot} (from GODOT_PROJECT_PATH)`);
    expect(statusText).toContain('Editor: connected. Godot 4.');
    expect(statusText).toContain('addon 0.1.0, bridge protocol 1');
    expect(statusText).toMatch(/Godot binary: .+ \(from running editor\), version 4\./);
  });

  it('answers ping through the bridge', async () => {
    const discovered = discovery.read();
    if (discovered.kind !== 'found') {
      throw new Error(`Expected a discovery file, got ${discovered.kind}`);
    }
    const bridge = new BridgeClient(discovered.endpoint, { clientName: 'integration-test', protocol: 1, requestTimeoutMs: 5_000 });

    try {
      await bridge.connect();
      await expect(bridge.request('ping')).resolves.toEqual({ pong: true });
    } finally {
      bridge.close();
    }
  });

  it('reports a stopped editor through its stale discovery file', async () => {
    editorProcess?.kill('SIGKILL');
    await waitFor(() => !isProcessAlive(editorPid()), 10_000);

    const statusText = await godotStatusText();

    expect(statusText).toContain('Editor: not connected.');
    expect(statusText).toContain('no longer running');
  });
});
