import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, positionIn, startHeadlessEditor, TemporaryProject } from './harness.js';

const playerScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 5.0',
  'const JUMP_VELOCITY := 4.5',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tif Input.is_action_just_pressed("jump") and is_on_floor():',
  '\t\tvelocity.y = JUMP_VELOCITY',
  '\tvelocity.z = -SPEED if Input.is_action_pressed("move_forward") else 0.0',
  '\tmove_and_slide()',
  '',
].join('\n');

const handsScript = [
  'extends Node',
  '',
  'var playing := false',
  'var done := false',
  'var _frame := 0',
  '',
  '',
  'func _physics_process(_delta: float) -> void:',
  '\tif not playing or done:',
  '\t\treturn',
  '\t_frame += 1',
  '\tmatch _frame:',
  '\t\t1:',
  '\t\t\t_press(KEY_W, true)',
  '\t\t40:',
  '\t\t\t_press(KEY_SPACE, true)',
  '\t\t44:',
  '\t\t\t_press(KEY_SPACE, false)',
  '\t\t70:',
  '\t\t\t_press(KEY_W, false)',
  '\t\t90:',
  '\t\t\tdone = true',
  '',
  '',
  'static func _press(code: Key, pressed: bool) -> void:',
  '\tvar event := InputEventKey.new()',
  '\tevent.physical_keycode = code',
  '\tevent.keycode = code',
  '\tevent.pressed = pressed',
  '\tInput.parse_input_event(event)',
  '',
].join('\n');

const mainScene = [
  '[gd_scene load_steps=5 format=3]',
  '',
  '[ext_resource type="Script" path="res://player.gd" id="1_player"]',
  '[ext_resource type="Script" path="res://hands.gd" id="2_hands"]',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_floor"]',
  'size = Vector3(40, 1, 40)',
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
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.5, 0)',
  'script = ExtResource("1_player")',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Player"]',
  'shape = SubResource("CapsuleShape3D_player")',
  '',
  '[node name="Hands" type="Node" parent="."]',
  'script = ExtResource("2_hands")',
  '',
].join('\n');

const replayTolerance = 0.2;

describe.skipIf(godotBinary === '')('recording the input of a person and playing it again', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  async function landedPlayerZ(): Promise<number> {
    await tools().call('game_wait', { condition: 'is_on_floor() and velocity.length() < 0.01', node: 'Player', timeout_ms: 10_000 });
    return positionIn((await tools().call('game_get_properties', { path: 'Player', names: ['position'] })).text).z;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP input recording', { mainScene: 'res://main.tscn' });
    project.write('player.gd', playerScript);
    project.write('hands.gd', handsScript);
    project.write('main.tscn', mainScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    await session.call('input_map_set', { actions: { move_forward: ['W'], jump: ['Space'] } });
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('records a walk and a jump as steps that game_input replays to the same place', async () => {
    await tools().call('game_run', { fixed_fps: 60 });
    const startZ = await landedPlayerZ();
    const started = await tools().call('game_record_input', { state: 'start' });
    await tools().call('game_set_properties', { path: 'Hands', properties: { playing: true } });
    await tools().call('game_wait', { condition: 'done', node: 'Hands', timeout_ms: 10_000 });
    const stopped = await tools().call('game_record_input', { state: 'stop' });
    const recordedZ = await landedPlayerZ();
    const listed = /^\[\n(?<steps>[\s\S]*)\n\]$/m.exec(stopped.text)?.groups?.['steps'] ?? '';
    const steps = JSON.parse(`[${listed}]`) as Record<string, unknown>[];

    await tools().call('game_stop');
    await tools().call('game_run', { fixed_fps: 60 });
    await landedPlayerZ();
    const replayed = await tools().call('game_input', { steps });
    const replayedZ = await landedPlayerZ();

    expect(started.text).toMatch(/^Recording the input of the running game from its physics frame \d+\./);
    expect(stopped.text).toMatch(/^Recorded \d+ steps from 4 input events over \d+ physics frames/);
    expect(steps).toContainEqual({ action: 'move_forward', state: 'down' });
    expect(steps).toContainEqual({ action: 'jump', physics_frames: 4 });
    expect(steps).toContainEqual({ action: 'move_forward', state: 'up' });
    expect(replayed.isError).toBe(false);
    expect(startZ - recordedZ).toBeGreaterThan(4);
    expect(Math.abs(replayedZ - recordedZ)).toBeLessThan(replayTolerance);
  });
});
