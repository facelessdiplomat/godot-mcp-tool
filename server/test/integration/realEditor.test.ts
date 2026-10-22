import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BridgeClient } from '../../src/bridge/BridgeClient.js';
import { DiscoveryFileReader, isProcessAlive } from '../../src/bridge/DiscoveryFileReader.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, testProjectRoot, waitFor } from './harness.js';

describe.skipIf(godotBinary === '')('the MCP server with a real headless Godot editor', () => {
  const discovery = new DiscoveryFileReader(testProjectRoot, isProcessAlive);
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function editorPid(): number {
    return editorProcess?.pid ?? -1;
  }

  async function godotStatusText(): Promise<string> {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return (await session.call('godot_status')).text;
  }

  beforeAll(async () => {
    editorProcess = await startHeadlessEditor(testProjectRoot);
    session = await McpSession.connect(testProjectRoot);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
  });

  it('reports the connected editor and finds the binary through it', async () => {
    const statusText = await godotStatusText();

    expect(statusText).toContain(`Project: ${testProjectRoot} (from GODOT_PROJECT_PATH)`);
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
