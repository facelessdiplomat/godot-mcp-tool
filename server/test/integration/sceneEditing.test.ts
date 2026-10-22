import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorTestHelper, editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScript = ['extends Node3D', '', '', 'func _on_start_pressed() -> void:', '\tpass', '', '', 'func _on_body_entered(body: Node3D) -> void:', '\tpass', ''].join('\n');

const mainScene = ['[gd_scene load_steps=2 format=3]', '', '[ext_resource type="Script" path="res://main.gd" id="1_main"]', '', '[node name="Main" type="Node3D"]', 'script = ExtResource("1_main")', ''].join('\n');

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
});
