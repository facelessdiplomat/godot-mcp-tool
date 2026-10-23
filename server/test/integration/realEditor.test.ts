import type { ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BridgeClient } from '../../src/bridge/BridgeClient.js';
import { DiscoveryFileReader, isProcessAlive } from '../../src/bridge/DiscoveryFileReader.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject, waitFor } from './harness.js';

const runProcess = promisify(execFile);

async function importProject(projectRoot: string): Promise<void> {
  await runProcess(godotBinary, ['--headless', '--path', projectRoot, '--import'], { timeout: editorStartupTimeoutMs });
}

describe.skipIf(godotBinary === '')('the MCP server with a real headless Godot editor', () => {
  const project = new TemporaryProject('MCP real editor');
  const discovery = new DiscoveryFileReader(project.root, isProcessAlive);
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
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project.remove();
  });

  it('reports the connected editor and finds the binary through it', async () => {
    const statusText = await godotStatusText();

    expect(statusText).toContain(`Project: ${project.root} (from GODOT_PROJECT_PATH)`);
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

  it('keeps the discovery file of the running editor when another Godot process opens the project', async () => {
    const editorRecord = discovery.read();

    await importProject(project.root);

    expect(editorRecord).toMatchObject({ kind: 'found', endpoint: { pid: editorPid() } });
    expect(discovery.read()).toEqual(editorRecord);
    expect(await godotStatusText()).toContain('Editor: connected.');
  }, editorStartupTimeoutMs);

  it('reports a stopped editor through its stale discovery file', async () => {
    editorProcess?.kill('SIGKILL');
    await waitFor(() => !isProcessAlive(editorPid()), 10_000);

    const statusText = await godotStatusText();

    expect(statusText).toContain('Editor: not connected.');
    expect(statusText).toContain('no longer running');
  });
});

describe.skipIf(godotBinary === '')('the MCP server after the editor of the project closed', () => {
  it('finds the Godot executable through the editor that closed', async () => {
    const project = new TemporaryProject('MCP closed editor');
    try {
      await importProject(project.root);
      const session = await McpSession.connect(project.root);
      const statusText = (await session.call('godot_status')).text;
      await session.close();

      expect(statusText).toContain('Editor: not connected. The Godot editor of this project was closed. Start it with editor_launch.');
      expect(statusText).toContain(`Godot binary: ${realpathSync(godotBinary)} (from last editor of the project)`);
    } finally {
      project.remove();
    }
  }, editorStartupTimeoutMs);
});
