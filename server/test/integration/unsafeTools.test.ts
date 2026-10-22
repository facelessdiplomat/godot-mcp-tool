import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const arenaScene = [
  '[gd_scene format=3]',
  '',
  '[node name="Arena" type="Node3D"]',
  '',
  '[node name="Camera" type="Camera3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 10)',
  '',
  '[node name="Player" type="Node3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 3, 0, 4)',
  '',
].join('\n');

const unsafeToolsAllowed = ['[godot_mcp_tool]', '', 'allow_unsafe_tools=true', ''].join('\n');

function projectWithArena(name: string, allowUnsafeTools: boolean): TemporaryProject {
  const project = new TemporaryProject(name, { withTestHelper: true, mainScene: 'res://arena.tscn' });
  project.write('arena.tscn', arenaScene);
  if (allowUnsafeTools) {
    mkdirSync(project.path('.godot/editor'), { recursive: true });
    project.write('.godot/editor/project_metadata.cfg', unsafeToolsAllowed);
  }
  return project;
}

describe.skipIf(godotBinary === '')('unsafe tools that the editor allows', () => {
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
    project = projectWithArena('MCP unsafe tools', true);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_MCP_UNSAFE: '1' });
    helper = new EditorTestHelper(project);
    await session.call('scene_open', { path: 'res://arena.tscn' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('runs code in the editor and returns its value', async () => {
    const result = await tools().call('editor_run_script', { code: 'var names := []\nfor child in scene.get_children():\n\tnames.append(str(child.name))\nreturn names' });

    expect(result).toEqual({ isError: false, text: 'The code ran in the editor and returned ["Camera","Player"]. Its changes are not in the Undo history.' });
  });

  it('reports the errors of the code with its own line numbers', async () => {
    const failing = await tools().call('editor_run_script', { code: 'var items := [1]\nreturn items[5]' });
    const broken = await tools().call('editor_run_script', { code: 'var x = 1 2' });

    expect(failing.isError).toBe(true);
    expect(failing.text).toContain('- line 2: Out of bounds get index');
    expect(failing.text).not.toContain('⚠');
    expect(broken.isError).toBe(true);
    expect(broken.text).toContain('The code does not compile:\n- line 1: Parse Error');
  });

  it('calls a node method and keeps the change undoable', async () => {
    const called = await tools().call('node_call_method', { path: 'Camera', method: 'look_at', args: [[3, 0, 4]] });
    const undone = await editorHelper().request('undo_in_edited_scene');

    expect(called.text).toBe('Called look_at on Camera in res://arena.tscn. It changed rotation, recorded as one Undo step; the scene has unsaved changes.');
    expect(undone).toEqual({ undone: true, action: 'MCP: Call look_at on Camera' });
  });

  it('evaluates an expression in the running game', async () => {
    await tools().call('game_run', { scene: 'res://arena.tscn' });

    const evaluated = await tools().call('game_eval', { expression: 'get_node("Player").position.distance_to(get_node("Camera").position)' });

    expect(evaluated.text).toMatch(/^get_node\("Player"\)\.position\.distance_to\(get_node\("Camera"\)\.position\) on the scene root in the running game = 8\.366\d* {2}\[float\]$/);
  });
});

describe.skipIf(godotBinary === '')('unsafe tools that the editor does not allow', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  beforeAll(async () => {
    project = projectWithArena('MCP unsafe tools off', false);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_MCP_UNSAFE: '1' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('refuses them until the user allows them in the editor', async () => {
    const refused = await session?.call('editor_run_script', { code: 'return 1' });

    expect(refused?.isError).toBe(true);
    expect(refused?.text).toBe(
      'Unsafe tools are turned off in the editor for this project\nHint: The user can turn them on in the editor with Project → Tools → Godot MCP Tool → Allow Unsafe Tools.',
    );
  });
});
