import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const gameStateScript = ['extends Node', '', 'var score := 0', ''].join('\n');
const scoringScript = ['extends Node', '', '', 'func _ready() -> void:', '\tGameState.score += 1', ''].join('\n');

describe.skipIf(godotBinary === '')('autoloads, groups, selection and closing scenes', () => {
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

  function workspace(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  function editorHelper(): EditorTestHelper {
    if (helper === undefined) {
      throw new Error('The editor test helper is not ready');
    }
    return helper;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP project editing', { withTestHelper: true });
    project.write('game_state.gd', gameStateScript);
    project.write('scoring.gd', scoringScript);
    const languageServerPort = await findFreePort();
    editorProcess = await startHeadlessEditor(project.root, { languageServer: languageServerPort });
    session = await McpSession.connect(project.root, { GODOT_LSP_PORT: String(languageServerPort) });
    helper = new EditorTestHelper(project);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('adds an autoload that scripts can use and removes it again', async () => {
    const added = await tools().call('autoload_add', { name: 'GameState', path: 'res://game_state.gd' });
    const checked = await tools().call('script_validate', { paths: ['res://scoring.gd'] });
    const savedProject = workspace().read('project.godot');
    const removed = await tools().call('autoload_remove', { name: 'GameState' });
    const checkedWithoutAutoload = await tools().call('script_validate', { paths: ['res://scoring.gd'] });

    expect(added.text).toMatch(/^Added the autoload GameState → res:\/\/game_state\.gd and saved project\.godot/);
    expect(savedProject).toMatch(/^GameState="\*(?:res:\/\/game_state\.gd|uid:\/\/\w+)"$/m);
    expect(checked.text).toMatch(/^No problems in 1 script: res:\/\/scoring\.gd/);
    expect(removed.text).toMatch(/^Removed the autoload GameState \(res:\/\/game_state\.gd\)/);
    expect(`${added.text}\n${removed.text}`).not.toContain('⚠');
    expect(workspace().read('project.godot')).not.toContain('GameState=');
    expect(checkedWithoutAutoload.text).toContain('GameState');
    expect(checkedWithoutAutoload.text).toMatch(/^1 error in 1 of 1 script/);
  });

  it('refuses an autoload name that would break the project, without a dialog in the editor', async () => {
    const refused = await tools().call('autoload_add', { name: 'Node3D', path: 'res://game_state.gd' });

    expect(refused).toEqual({
      isError: true,
      text: 'Node3D cannot be an autoload name: Node3D is the name of an engine class\nHint: Autoload names are usually in PascalCase, such as GameState.',
    });
  });

  it('puts a node into a group that is saved with the scene', async () => {
    await tools().call('scene_create', { path: 'res://arena.tscn', root_type: 'Node3D' });
    await tools().call('node_add', { type: 'Area3D', name: 'Coin' });

    const grouped = await tools().call('node_set_groups', { path: 'Coin', add: ['pickups'] });
    await tools().call('scene_save');
    const found = await tools().call('node_find', { group: 'pickups' });

    expect(grouped.text).toBe('Updated the groups of Coin in res://arena.tscn, now: pickups. The scene has unsaved changes.');
    expect(workspace().read('arena.tscn')).toContain('groups=["pickups"]');
    expect(found.text).toContain('Coin');
  });

  it('selects nodes and files in the editor', async () => {
    const nodes = await tools().call('editor_select', { nodes: ['Coin'] });
    const nodeSelection = await editorHelper().request('read_selection');
    const file = await tools().call('editor_select', { file: 'res://game_state.gd' });
    const fileSelection = await editorHelper().request('read_selection');

    expect(nodes.text).toBe('Selected Coin in res://arena.tscn in the editor.');
    expect(nodeSelection['nodes']).toEqual(['Coin']);
    expect(file.text).toBe('Selected res://game_state.gd in the FileSystem dock of the editor.');
    expect(fileSelection['files']).toEqual(['res://game_state.gd']);
  });

  it('keeps a scene with unsaved changes open until told what to do with them', async () => {
    await tools().call('node_add', { type: 'Node3D', name: 'Unsaved' });

    const refused = await tools().call('scene_close');
    const closed = await tools().call('scene_close', { unsaved: 'discard' });
    const tree = await tools().call('scene_get_tree');

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('res://arena.tscn has unsaved changes');
    expect(closed.text).toBe('Closed res://arena.tscn without its unsaved changes. No scene is open now.');
    expect(tree.isError).toBe(true);
    expect(workspace().read('arena.tscn')).not.toContain('Unsaved');
  });

  it('names physics layers and sets and reads a mask by those names', async () => {
    const named = await tools().call('project_settings_set', { values: { 'layer_names/3d_physics/layer_2': 'player', 'layer_names/3d_physics/layer_3': 'enemies' } });
    const info = await tools().call('project_info');
    await tools().call('scene_create', { path: 'res://door.tscn', root_type: 'Area3D' });
    const changed = await tools().call('node_set_properties', { path: '.', properties: { collision_mask: ['player'] } });
    const unknown = await tools().call('node_set_properties', { path: '.', properties: { collision_mask: ['ghosts'] } });
    const read = await tools().call('node_get_properties', { path: '.', names: ['collision_mask'] });

    expect(named.isError).toBe(false);
    expect(workspace().read('project.godot')).toContain('3d_physics/layer_2="player"');
    expect(info.text).toContain('Named layers (masks such as collision_mask take these names): 3d_physics 2 "player", 3 "enemies"');
    expect(changed.text).toContain('Applied: collision_mask');
    expect(unknown.text).toContain('collision_mask: no 3D physics layer is named "ghosts"; the named 3D physics layers are 2 "player", 3 "enemies"');
    expect(read.text).toContain('collision_mask = 2 (layer 2 "player")  [3d_physics layers]');
  });
});
