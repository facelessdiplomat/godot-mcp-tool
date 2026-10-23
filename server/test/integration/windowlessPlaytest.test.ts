import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { godotBinary, McpSession, TemporaryProject } from './harness.js';

const playerScript = [
  'extends CharacterBody3D',
  '',
  'var jumps := 0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tif Input.is_physical_key_pressed(KEY_SPACE) and is_on_floor():',
  '\t\tvelocity.y = 4.5',
  '\t\tjumps += 1',
  '\tmove_and_slide()',
  '',
].join('\n');

const mainScene = [
  '[gd_scene load_steps=4 format=3]',
  '',
  '[ext_resource type="Script" path="res://player.gd" id="1_player"]',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_floor"]',
  'size = Vector3(20, 1, 20)',
  '',
  '[sub_resource type="CapsuleShape3D" id="CapsuleShape3D_player"]',
  '',
  '[node name="Main" type="Node3D"]',
  '',
  '[node name="Floor" type="StaticBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Floor"]',
  'shape = SubResource("BoxShape3D_floor")',
  '',
  '[node name="Player" type="CharacterBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0)',
  'script = ExtResource("1_player")',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Player"]',
  'shape = SubResource("CapsuleShape3D_player")',
  '',
].join('\n');

const jumpAction = [
  '[input]',
  '',
  'jump={',
  '"deadzone": 0.2,',
  '"events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":0,"physical_keycode":32,"key_label":0,"unicode":32,"location":0,"echo":false,"script":null)',
  ']',
  '}',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('playtesting without the editor or a window', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP windowless playtest', { mainScene: 'res://main.tscn', withRuntimeAutoload: true });
    project.write('player.gd', playerScript);
    project.write('main.tscn', mainScene);
    project.write('project.godot', `${project.read('project.godot')}\n${jumpAction}`);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary, GODOT_MCP_HEADLESS: '1' });
  });

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    project?.remove();
  });

  it('reads the project and its input actions without the editor', async () => {
    const info = await tools().call('project_info');
    const actions = await tools().call('input_map_get');

    expect(info.isError).toBe(false);
    expect(info.text).toContain('Project: MCP windowless playtest');
    expect(info.text).toContain('Main scene: res://main.tscn');
    expect(info.text).toContain('Indentation in .gd files: tabs');
    expect(actions.text).toBe('jump: Space');
  });

  it('runs the game as a process without a window and waits for the player to land', async () => {
    const run = await tools().call('game_run');
    const landed = await tools().call('game_wait', { node: 'Player', condition: 'is_on_floor()', timeout_ms: 10_000 });

    expect(run.text).toMatch(/^The game is running res:\/\/main\.tscn/);
    expect(landed.isError).toBe(false);
    expect(landed.text).toMatch(/became true on Player/);
  });

  it('plays input into the game and reads what it did', async () => {
    const played = await tools().call('game_input', { steps: [{ key: 'Space', ms: 200 }] });
    const properties = await tools().call('game_get_properties', { path: 'Player', names: ['jumps'] });
    const tree = await tools().call('game_get_tree');

    expect(played.isError).toBe(false);
    expect(properties.text).toContain('jumps = 1');
    expect(tree.text).toContain('Player: CharacterBody3D');
  });

  it('pauses the game and advances it by exact physics frames', async () => {
    const paused = await tools().call('game_pause');
    const stepped = await tools().call('game_step', { physics_frames: 5 });
    const resumed = await tools().call('game_pause', { paused: false });

    expect(paused.isError).toBe(false);
    expect(stepped.isError).toBe(false);
    expect(stepped.text).toContain('5 physics frames');
    expect(resumed.isError).toBe(false);
  });

  it('answers that the game is not running once it stopped', async () => {
    await tools().call('game_stop');

    const properties = await tools().call('game_get_properties', { path: 'Player', names: ['jumps'] });

    expect(properties.isError).toBe(true);
    expect(properties.text).toContain('The game is not running');
  });
});
