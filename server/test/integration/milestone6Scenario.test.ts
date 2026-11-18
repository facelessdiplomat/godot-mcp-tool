import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject } from './harness.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';
const arenaScene = 'res://arena.tscn';

const playerScript = [
  'extends CharacterBody3D',
  '',
  'signal landed',
  '',
  'const JUMP_VELOCITY := 4.5',
  '',
  'var was_in_air := false',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tif Input.is_action_just_pressed("jump") and is_on_floor():',
  '\t\tvelocity.y = JUMP_VELOCITY',
  '\tmove_and_slide()',
  '\tif not is_on_floor():',
  '\t\twas_in_air = true',
  '\telif was_in_air:',
  '\t\twas_in_air = false',
  '\t\tlanded.emit()',
  '',
].join('\n');

const pauseMenuScript = [
  'extends CanvasLayer',
  '',
  '',
  'func _ready() -> void:',
  '\tvisible = false',
  '\t$Buttons/Resume.pressed.connect(_resume)',
  '',
  '',
  'func _unhandled_input(event: InputEvent) -> void:',
  '\tif event.is_action_pressed("pause") and not get_tree().paused:',
  '\t\tget_tree().paused = true',
  '\t\tvisible = true',
  '',
  '',
  'func _resume() -> void:',
  '\tget_tree().paused = false',
  '\tvisible = false',
  '',
].join('\n');

const enemyScene = [
  '[gd_scene load_steps=3 format=3]',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_gray"]',
  'albedo_color = Color(0.5, 0.5, 0.5, 1)',
  '',
  '[sub_resource type="CapsuleMesh" id="CapsuleMesh_body"]',
  'material = SubResource("Material_gray")',
  '',
  '[node name="Enemy" type="Node3D"]',
  '',
  '[node name="Body" type="MeshInstance3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0)',
  'mesh = SubResource("CapsuleMesh_body")',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('the milestone 6 scenario: one red enemy, a menu clicked by its path and a jump that lands once', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function savedArena(): string {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project.read('arena.tscn');
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP milestone 6', { mainScene: arenaScene });
    project.write('player.gd', playerScript);
    project.write('pause_menu.gd', pauseMenuScript);
    project.write('enemy.tscn', enemyScene);
    editorProcess = windowed ? await startWindowedEditor(project.root) : await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
    await session.call('input_map_set', { actions: { jump: ['Space'], pause: ['Escape'] } });
    await session.call('scene_create', { path: arenaScene, root_type: 'Node3D' });
    await session.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 4, 10], rotation_degrees: [-15, 0, 0] } },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 0.5, 4], script: 'res://player.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D' } } },
        { op: 'node_add', type: 'res://enemy.tscn', name: 'Enemy1', properties: { position: [-3, 0, 0] } },
        { op: 'node_add', type: 'res://enemy.tscn', name: 'Enemy2', properties: { position: [0, 0, 0] } },
        { op: 'node_add', type: 'res://enemy.tscn', name: 'Enemy3', properties: { position: [3, 0, 0] } },
        { op: 'node_add', type: 'CanvasLayer', name: 'PauseMenu', properties: { process_mode: 'Always', script: 'res://pause_menu.gd' } },
        { op: 'node_add', type: 'VBoxContainer', name: 'Buttons', parent: 'PauseMenu', properties: { position: [500, 280] } },
        { op: 'node_add', type: 'Button', name: 'Resume', parent: 'PauseMenu/Buttons', properties: { text: 'Resume' } },
      ],
    });
    await session.call('scene_save');
  }, editorStartupTimeoutMs + 60_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('paints the second enemy red and leaves the others and the enemy scene as they are', async () => {
    const deep = await tools().call('scene_get_tree', { expand_instances: true });
    const painted = await tools().call('node_set_properties', { path: 'Enemy2/Body', properties: { material_override: { new: 'StandardMaterial3D', albedo_color: 'red' } } });
    await tools().call('scene_save');

    expect(deep.text).toContain('Body: MeshInstance3D');
    expect(painted.text).toContain('Turned on Editable Children of Enemy2');
    expect(savedArena()).toContain('[editable path="Enemy2"]');
    expect(savedArena()).toMatch(/\[node name="Body" parent="Enemy2"[^\]]*\]\nmaterial_override = SubResource/);
    expect(savedArena()).not.toMatch(/parent="Enemy1"|parent="Enemy3"/);
    expect(project?.read('enemy.tscn')).toBe(enemyScene);
  });

  it('shows the selection the user made in the editor', async () => {
    await tools().call('editor_select', { nodes: ['Enemy2'] });

    const state = await tools().call('editor_get_state');

    expect(state.text).toContain('Selected nodes: Enemy2 (Node3D).');
  });

  it('opens the pause menu and presses Resume by its path', async () => {
    await tools().call('game_run', { debug_draw: ['collisions'] });
    await tools().call('game_wait', { physics_frames: 10 });
    const hidden = await tools().call('game_get_tree', { controls: true, path: 'PauseMenu' });
    await tools().call('game_input', { steps: [{ key: 'Escape' }, { wait_ms: 100 }] });
    const shown = await tools().call('game_get_tree', { controls: true, path: 'PauseMenu' });
    const clicked = await tools().call('game_input', { steps: [{ click: 'PauseMenu/Buttons/Resume' }, { wait_ms: 100 }] });
    const resumed = await tools().call('game_wait', { condition: 'not get_tree().paused', timeout_ms: 2000 });

    expect(hidden.text).toContain('No control of the running game');
    expect(shown.text).toContain('PauseMenu/Buttons/Resume: Button "Resume"');
    expect(clicked.text).toContain('Step 1 clicked PauseMenu/Buttons/Resume at');
    expect(resumed.text).toContain('became true');
  });

  it('lands once after a jump', async () => {
    const played = await tools().call('game_input', {
      steps: [{ wait_physics_frames: 10 }, { action: 'jump' }, { wait_physics_frames: 120 }],
      watch_signals: [{ node: 'Player', signal: 'landed' }],
    });

    expect(played.text).toContain('Player.landed was emitted 1 time');
  });

  it.skipIf(!windowed)('shows the jump frame by frame with the collision shapes drawn', async () => {
    await tools().call('game_input', { steps: [{ action: 'jump' }] });

    const strip = await tools().callForImage('game_screenshot', { frames: 4, every_physics_frames: 6 });

    expect(strip.text).toContain('at frame 0; frame 6; frame 12; frame 18, in one labelled image');
    expect(strip.image).toBeDefined();
  });
});
