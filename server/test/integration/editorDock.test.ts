import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('the Godot MCP dock of the editor', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;
  let helper: EditorTestHelper | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function editorHelper(): EditorTestHelper {
    if (helper === undefined) {
      throw new Error('The editor test helper is not ready');
    }
    return helper;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP dock', { withTestHelper: true });
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    helper = new EditorTestHelper(project);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('shows the bridge, the connected server and the recent commands of the agent', async () => {
    await tools().call('scene_create', { path: 'res://main.tscn', root_type: 'Node3D' });
    await tools().call('node_add', { type: 'Camera3D', name: 'Camera' });
    await tools().call('node_set_properties', { path: 'Missing', properties: { visible: false } });

    const dock = await editorHelper().request('read_mcp_dock');

    expect(dock['status']).toMatch(/^Bridge: listening on 127\.0\.0\.1:\d+\nMCP clients: 1 connected\nGame: stopped$/);
    expect(dock['unsafe_tools']).toBe(false);
    expect(dock['commands']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\d\d:\d\d:\d\d {2}node_set_properties {2}failed: /),
        expect.stringMatching(/^\d\d:\d\d:\d\d {2}node_add {2}\d+ ms$/),
        expect.stringMatching(/^\d\d:\d\d:\d\d {2}scene_create {2}\d+ ms$/),
      ]),
    );
  });

  it('turns the unsafe tools of the project on and off', async () => {
    expect(await editorHelper().request('toggle_unsafe_tools_in_mcp_dock')).toEqual({ unsafe_tools: true, allowed_in_project: true });
    expect(await editorHelper().request('toggle_unsafe_tools_in_mcp_dock')).toEqual({ unsafe_tools: false, allowed_in_project: false });
  });
});
