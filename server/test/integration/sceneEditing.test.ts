import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScript = ['extends Node3D', '', '', 'func _on_start_pressed() -> void:', '\tpass', '', '', 'func _on_body_entered(body: Node3D) -> void:', '\tpass', ''].join('\n');

const mainScene = ['[gd_scene load_steps=2 format=3]', '', '[ext_resource type="Script" path="res://main.gd" id="1_main"]', '', '[node name="Main" type="Node3D"]', 'script = ExtResource("1_main")', ''].join('\n');

const crateScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_crate"]',
  '',
  '[node name="Crate" type="Node3D"]',
  '',
  '[node name="Mesh" type="MeshInstance3D" parent="."]',
  'mesh = SubResource("BoxMesh_crate")',
  '',
].join('\n');

const doorScript = ['extends Node3D', '', '', 'func _on_area_body_entered(_body: Node3D) -> void:', '\tpass', ''].join('\n');

const doorScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[ext_resource type="Script" path="res://door.gd" id="1_door"]',
  '',
  '[node name="Door" type="Node3D"]',
  'script = ExtResource("1_door")',
  '',
  '[node name="Area" type="Area3D" parent="."]',
  '',
  '[connection signal="body_entered" from="Area" to="." method="_on_area_body_entered"]',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('editing the structure and the signals of a scene', () => {
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

  function savedScene(): string {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project.read('main.tscn');
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP scene editing', { withTestHelper: true, mainScene: 'res://main.tscn' });
    project.write('main.gd', mainScript);
    project.write('main.tscn', mainScene);
    project.write('crate.tscn', crateScene);
    project.write('door.gd', doorScript);
    project.write('door.tscn', doorScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    helper = new EditorTestHelper(project);
    await session.call('scene_open', { path: 'res://main.tscn' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('builds a scene in one batch and saves its signal connections', async () => {
    const built = await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 1, 0] } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: { shape: { new: 'CapsuleShape3D' } } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', parent: 'Player', properties: { position: [0, 2, 4] } },
        { op: 'node_add', type: 'Button', name: 'Start' },
        { op: 'node_add', type: 'Area3D', name: 'Goal', properties: { position: [5, 0, 0] } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Goal', properties: { shape: { new: 'BoxShape3D' } } },
        { op: 'signal_connect', from: 'Start', signal: 'pressed', method: '_on_start_pressed' },
        { op: 'signal_connect', from: 'Goal', signal: 'body_entered', method: '_on_body_entered' },
      ],
    });
    await tools().call('scene_save');

    expect(built.isError).toBe(false);
    expect(built.text).toContain('Applied 9 operations to res://main.tscn as one Undo step.');
    expect(built.text).toContain('9. Connected Goal.body_entered to _on_body_entered() on the scene root');
    expect(savedScene()).toContain('[connection signal="pressed" from="Start" to="." method="_on_start_pressed"]');
    expect(savedScene()).toContain('[connection signal="body_entered" from="Goal" to="." method="_on_body_entered"]');
  });

  it('undoes a batch in one step in the editor', async () => {
    await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'Node3D', name: 'TempA' },
        { op: 'node_add', type: 'Node3D', name: 'TempB', parent: 'TempA' },
      ],
    });

    const undone = await editorHelper().request('undo_in_edited_scene');
    const tree = await tools().call('scene_get_tree');

    expect(undone).toEqual({ undone: true, action: 'MCP: Edit Main (2 operations)' });
    expect(tree.text).not.toContain('TempA');
  });

  it('changes nothing when an operation of a batch fails', async () => {
    const failed = await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'Node3D', name: 'Leftover' },
        { op: 'node_set_properties', path: 'Ghost', properties: { visible: false } },
      ],
    });
    const tree = await tools().call('scene_get_tree');

    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('Operation 2 (node_set_properties)');
    expect(failed.text).toContain('Nothing was changed.');
    expect(tree.text).not.toContain('Leftover');
  });

  it('finds nodes by type', async () => {
    const found = await tools().call('node_find', { type: 'CollisionShape3D' });

    expect(found.text).toContain('2 nodes in res://main.tscn match:');
    expect(found.text).toContain('Player/Shape: CollisionShape3D');
    expect(found.text).toContain('Goal/Shape: CollisionShape3D');
  });

  it('reads several nodes in one call', async () => {
    const read = await tools().call('node_get_properties', { paths: ['Player', 'Goal', 'Ghost'], names: ['position'] });

    expect(read.isError).toBe(false);
    expect(read.text).toMatch(/^Player \(CharacterBody3D\) in res:\/\/main\.tscn\nposition = /);
    expect(read.text).toMatch(/\n\nGoal \(\w+\) in res:\/\/main\.tscn\nposition = /);
    expect(read.text).toContain('\n\nNode "Ghost" not found');
  });

  it('moves the camera out of the player without moving it in the world', async () => {
    const moved = await tools().call('node_reparent', { path: 'Player/Camera', parent: '.' });
    const camera = await tools().call('node_get_properties', { path: 'Camera', names: ['position'] });

    expect(moved.text).toContain('Moved Player/Camera to Camera in res://main.tscn.');
    expect(camera.text).toContain('position = Vector3(0, 3, 4)');
  });

  it('duplicates a node together with its signal connection', async () => {
    const duplicated = await tools().call('node_duplicate', { path: 'Goal', properties: { position: [-5, 0, 0] } });
    await tools().call('scene_save');

    expect(duplicated.text).toContain('Duplicated Goal as Goal2 (Area3D)');
    expect(savedScene()).toContain('[connection signal="body_entered" from="Goal2" to="." method="_on_body_entered"]');
  });

  it('lists the saved connections of the scene', async () => {
    const listed = await tools().call('signal_list');

    expect(listed.text).toContain('Start.pressed → _on_start_pressed() on the scene root');
    expect(listed.text).toContain('Goal2.body_entered → _on_body_entered() on the scene root');
  });

  it('names the function to add when the method is missing', async () => {
    const failed = await tools().call('signal_connect', { from: 'Goal', signal: 'body_exited', method: '_on_goal_left' });

    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('Add func _on_goal_left(body: Node3D) -> void: to res://main.gd');
  });

  it('disconnects a signal and saves the scene without it', async () => {
    const disconnected = await tools().call('signal_disconnect', { from: 'Start', signal: 'pressed', method: '_on_start_pressed' });
    await tools().call('scene_save');

    expect(disconnected.text).toContain('Disconnected Start.pressed from _on_start_pressed() on the scene root');
    expect(savedScene()).not.toContain('from="Start"');
  });

  it('saves a change inside an instanced scene for that instance only, and undoes it in one step', async () => {
    await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'res://crate.tscn', name: 'Crate1' },
        { op: 'node_add', type: 'res://crate.tscn', name: 'Crate2' },
      ],
    });
    const changed = await tools().call('node_set_properties', { path: 'Crate2/Mesh', properties: { visible: false } });
    await tools().call('scene_save');
    const savedWithTheChange = savedScene();
    const undone = await editorHelper().request('undo_in_edited_scene');
    await tools().call('scene_save');

    expect(changed.text).toContain('Turned on Editable Children of Crate2, so that this change inside the instanced scene is saved with this scene.');
    expect(savedWithTheChange).toContain('[editable path="Crate2"]');
    expect(savedWithTheChange).toMatch(/\[node name="Mesh" parent="Crate2"[^\]]*\]\nvisible = false/);
    expect(savedWithTheChange).not.toContain('parent="Crate1"');
    expect(undone).toEqual({ undone: true, action: 'MCP: Set properties of Mesh' });
    expect(savedScene()).not.toContain('[editable path="Crate2"]');
    expect(savedScene()).not.toContain('visible = false');
  });

  it('refuses to disconnect a connection that an instanced scene makes', async () => {
    await tools().call('node_add', { type: 'res://door.tscn', name: 'Door' });
    const refused = await tools().call('signal_disconnect', { from: 'Door/Area', signal: 'body_entered', to: 'Door', method: '_on_area_body_entered' });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('Door/Area.body_entered is connected to Door._on_area_body_entered() by res://door.tscn, so this scene cannot remove the connection');
  });

  it('lists the nodes inside instanced scenes when asked', async () => {
    const shallow = await tools().call('scene_get_tree');
    const deep = await tools().call('scene_get_tree', { expand_instances: true });

    expect(shallow.text).toContain('Nodes inside instanced scenes are not shown; expand_instances: true lists them too.');
    expect(shallow.text).not.toContain('Mesh: MeshInstance3D');
    expect(deep.text).toContain('Mesh: MeshInstance3D');
    expect(deep.text).toContain('Area: Area3D');
  });

  it('saves a branch as a scene of its own, keeps its connections, and undoes it in one step', async () => {
    const saved = await tools().call('node_save_as_scene', { path: 'Goal2', file: 'res://props/goal.tscn' });
    await tools().call('scene_save');
    const savedWithTheInstance = savedScene();
    const goalScene = project === undefined ? '' : project.read('props/goal.tscn');
    const undone = await editorHelper().request('undo_in_edited_scene');
    await tools().call('scene_save');

    expect(saved.isError).toBe(false);
    expect(saved.text).toContain('Saved Goal2 and its 1 child node as res://props/goal.tscn');
    expect(goalScene).toMatch(/\[node name="Goal2" type="Area3D"[^\]]*\]/);
    expect(goalScene).toMatch(/\[node name="Shape" type="CollisionShape3D" parent="\."[^\]]*\]/);
    expect(savedWithTheInstance).toMatch(/\[node name="Goal2" parent="\."[^\]]* instance=ExtResource\("[^"]+"\)[^\]]*\]\ntransform = Transform3D\(1, 0, 0, 0, 1, 0, 0, 0, 1, -5, 0, 0\)/);
    expect(savedWithTheInstance).toContain('[connection signal="body_entered" from="Goal2" to="." method="_on_body_entered"]');
    expect(undone).toEqual({ undone: true, action: 'MCP: Save Goal2 as res://props/goal.tscn' });
    expect(savedScene()).not.toMatch(/\[node name="Goal2"[^\]]*instance=/);
    expect(savedScene()).toMatch(/\[node name="Shape" type="CollisionShape3D" parent="Goal2"[^\]]*\]/);
  });

  it('changes one property of a built-in resource by its path and refuses a resource of an instanced scene', async () => {
    const changed = await tools().call('node_set_properties', { path: 'Player/Shape', properties: { 'shape:radius': 0.4 } });
    const refused = await tools().call('node_set_properties', { path: 'Crate1/Mesh', properties: { 'mesh:size': [3, 3, 3] } });
    await tools().call('scene_save');

    expect(changed.text).toContain('Applied: shape:radius');
    expect(savedScene()).toMatch(/\[sub_resource type="CapsuleShape3D"[^\]]*\]\nradius = 0\.4/);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('mesh comes from res://crate.tscn');
  });

  it('reads back what is selected in the editor', async () => {
    await tools().call('editor_select', { nodes: ['Player', 'Floor'] });

    const state = await tools().call('editor_get_state');

    expect(state.text).toContain('res://main.tscn');
    expect(state.text).toContain('Selected nodes: Player (CharacterBody3D), Floor (CSGBox3D).');
  });

  it('makes an instance local together with the connections its scene made', async () => {
    const made = await tools().call('node_make_local', { path: 'Door' });
    await tools().call('scene_save');

    expect(made.text).toContain('Made Door local in res://main.tscn: it and its 1 node from res://door.tscn now belong to this scene');
    expect(savedScene()).toMatch(/\[node name="Area" type="Area3D" parent="Door"[^\]]*\]/);
    expect(savedScene()).toContain('[connection signal="body_entered" from="Door/Area" to="Door" method="_on_area_body_entered"]');
    expect(savedScene()).not.toContain('path="res://door.tscn"');
  });

  it('takes back its own changes with editor_undo, does them again with editor_redo, and stops at a change of the user', async () => {
    await tools().call('node_set_properties', { path: 'Player', properties: { position: [1, 2, 3] } });
    await tools().call('node_set_properties', { path: 'Player', properties: { position: [4, 5, 6] } });

    const undone = await tools().call('editor_undo', { count: 2 });
    const afterUndo = await tools().call('node_get_properties', { path: 'Player', names: ['position'] });
    const redone = await tools().call('editor_redo');
    const afterRedo = await tools().call('node_get_properties', { path: 'Player', names: ['position'] });

    expect(undone.text).toContain('Undid 2 actions in res://main.tscn: MCP: ');
    expect(redone.text).toContain('Redid 1 action in res://main.tscn: MCP: ');
    expect(afterRedo.text).toContain('position = Vector3(1, 2, 3)');
    expect(afterUndo.text).not.toContain('position = Vector3(1, 2, 3)');
  });
});

