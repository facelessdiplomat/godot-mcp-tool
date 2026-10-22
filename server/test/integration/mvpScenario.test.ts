import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const brokenArenaScript = [
  'extends Node3D',
  '',
  '',
  'func _ready() -> void:',
  '\tprint("Arena ready")',
  '\tawait get_tree().create_timer(1.5).timeout',
  '\t_spawn_wave()',
  '',
  '',
  'func _spawn_wave() -> void:',
  '\tvar spawner: Node3D = get_node_or_null("Spawner")',
  '\tspawner.position = Vector3.ZERO',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('the milestone 1 scenario', () => {
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

  function user(): EditorTestHelper {
    if (helper === undefined) {
      throw new Error('The editor test helper is not ready');
    }
    return helper;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP milestone 1', { withTestHelper: true });
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    helper = new EditorTestHelper(project);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('builds the arena, makes it the main scene, runs it and shows the output', async () => {
    const steps = [
      await tools().call('scene_create', { path: 'res://levels/arena.tscn', root_type: 'Node3D' }),
      await tools().call('node_add', { type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], use_collision: true, position: [0, -0.5, 0] } }),
      await tools().call('node_add', { type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } }),
      await tools().call('node_add', {
        type: 'WorldEnvironment',
        name: 'Environment',
        properties: { environment: { new: 'Environment', background_mode: 'Sky', sky: { new: 'Sky', sky_material: { new: 'ProceduralSkyMaterial' } } } },
      }),
      await tools().call('node_add', { type: 'Camera3D', name: 'Camera', properties: { position: [0, 12, 14], rotation_degrees: [-40.6, 0, 0] } }),
      await tools().call('project_settings_set', { values: { 'application/run/main_scene': 'res://levels/arena.tscn' } }),
      await tools().call('scene_save'),
    ];
    const run = await tools().call('game_run');

    expect(steps.filter((step) => step.isError)).toEqual([]);
    expect(steps.map((step) => step.text).join('\n')).not.toContain('Rejected');
    expect(run.text).toMatch(/^The game is running res:\/\/levels\/arena\.tscn; it was ready after \d+ ms\./);
    await tools().call('game_stop');
  });

  it('lets the user undo a change with the editor history', async () => {
    await tools().call('node_add', { type: 'MeshInstance3D', name: 'Crate' });

    const undone = await user().request('undo_in_edited_scene');
    const tree = await tools().call('scene_get_tree');

    expect(undone).toEqual({ undone: true, action: 'MCP: Add Crate' });
    expect(tree.text).not.toContain('Crate');
  });

  it('shows a deliberate script error with file, line and stack, and summarizes it in the next response', async () => {
    tools();
    project?.write('levels/arena.gd', brokenArenaScript);
    await tools().call('editor_rescan');
    await tools().call('node_set_properties', { path: '.', properties: { script: 'res://levels/arena.gd' } });
    await tools().call('scene_save');
    const run = await tools().call('game_run');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));

    const next = await tools().client.callTool({ name: 'scene_get_tree', arguments: {} });
    const output = await tools().call('game_get_output', { levels: ['error'] });

    expect(run.text).toContain('Arena ready');
    expect(next.content.map((content) => (content.type === 'text' ? content.text : '')).at(-1)).toMatch(
      /^⚠ 1 new error since the last call\. Latest, in the game: res:\/\/levels\/arena\.gd:12: /,
    );
    expect(output.text).toMatch(/ERROR res:\/\/levels\/arena\.gd:12 in _spawn_wave: /);
    expect(output.text).toContain('  at res://levels/arena.gd:12 in _spawn_wave');
    expect(output.text).toContain('  at res://levels/arena.gd:7 in _ready');
  });
});
