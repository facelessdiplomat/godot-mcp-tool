import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DiscoveryFileReader, isProcessAlive } from '../../src/bridge/DiscoveryFileReader.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('starting the editor from the server', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP editor launch');
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.close();
    if (project !== undefined) {
      const discovered = new DiscoveryFileReader(project.root, isProcessAlive).read();
      if (discovered.kind === 'found') {
        process.kill(discovered.endpoint.pid, 'SIGKILL');
      }
      project.remove();
    }
  });

  it(
    'starts the editor and waits until its plugin connects',
    async () => {
      const before = await tools().call('godot_status');
      const launched = await tools().call('editor_launch', { headless: true });
      const after = await tools().call('godot_status');

      expect(before.text).toContain('Editor: not connected.');
      expect(before.text).toContain('Start it with editor_launch.');
      expect(launched.isError).toBe(false);
      expect(launched.text).toMatch(/^Started the Godot editor for .+: Godot 4\.\d+.* with the plugin \d+\.\d+\.\d+, connected after \d+\.\d s\./);
      expect(after.text).toContain('Editor: connected.');
    },
    editorStartupTimeoutMs,
  );

  it('does not start a second editor', async () => {
    const again = await tools().call('editor_launch', { headless: true });

    expect(again.text).toContain('The Godot editor is already running for');
  });
});
