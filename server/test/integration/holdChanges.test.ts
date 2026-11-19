import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('holding the changes of the agent in the editor', () => {
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
    project = new TemporaryProject('MCP hold changes', { withTestHelper: true, mainScene: 'res://arena.tscn' });
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    helper = new EditorTestHelper(project);
    await session.call('scene_create', { path: 'res://arena.tscn', root_type: 'Node3D' });
    await session.call('scene_save');
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('refuses changes and starting the game while the user holds them, and still reads', async () => {
    expect(await editorHelper().request('toggle_hold_changes_in_mcp_dock')).toEqual({ hold_changes: true });

    const edit = await tools().call('scene_batch_edit', { operations: [{ op: 'node_add', type: 'Node3D', name: 'Crate' }] });
    const run = await tools().call('game_run');
    const tree = await tools().call('scene_get_tree');
    const status = await tools().call('godot_status');
    const dock = await editorHelper().request('read_mcp_dock');

    expect(edit.isError).toBe(true);
    expect(edit.text).toContain('Changes are held in the editor, so this was not done');
    expect(edit.text).toContain('Project → Tools → Godot MCP Tool → Hold Changes');
    expect(run.isError).toBe(true);
    expect(run.text).toContain('Changes are held in the editor');
    expect(tree.isError).toBe(false);
    expect(tree.text).not.toContain('Crate');
    expect(status.text).toContain('Changes are held: the user turned on Hold Changes in the editor');
    expect(dock['hold_changes']).toBe(true);
    expect(dock['commands']).toEqual(expect.arrayContaining([expect.stringMatching(/^\d\d:\d\d:\d\d {2}scene_batch_edit {2}failed: Changes are held in the editor/)]));
  });

  it('applies the same change once the user lets changes go again', async () => {
    expect(await editorHelper().request('toggle_hold_changes_in_mcp_dock')).toEqual({ hold_changes: false });

    const edit = await tools().call('scene_batch_edit', { operations: [{ op: 'node_add', type: 'Node3D', name: 'Crate' }] });
    const status = await tools().call('godot_status');

    expect(edit.isError).toBe(false);
    expect((await tools().call('scene_get_tree')).text).toContain('Crate: Node3D');
    expect(status.text).not.toContain('Changes are held');
  });
});
