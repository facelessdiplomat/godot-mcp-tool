import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

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

const mainScene = [
  '[gd_scene load_steps=4 format=3]',
  '',
  '[ext_resource type="Script" path="res://player.gd" id="1_player"]',
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
].join('\n');

function zOf(propertiesText: string): number {
  const match = /position = Vector3\([^,]+, [^,]+, (?<z>[^)]+)\)/.exec(propertiesText);
  return Number(match?.groups?.['z']);
}

describe.skipIf(godotBinary === '')('playing input into the game', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP game input', { mainScene: 'res://main.tscn' });
    project.write('player.gd', playerScript);
    project.write('main.tscn', mainScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('creates the input actions of the project', async () => {
    const changed = await tools().call('input_map_set', { actions: { move_forward: ['W', 'Up'], jump: ['Space'] } });
    const listed = await tools().call('input_map_get');

    expect(changed.text).toContain('Saved project.godot.');
    expect(changed.text).toContain('move_forward: W, Up (new)');
    expect(listed.text).toContain('jump: Space');
    expect(project?.read('project.godot')).toContain('move_forward={');
  });

  it('walks the player forward while the action is held', async () => {
    await tools().call('game_run');
    await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });
    const before = zOf((await tools().call('game_get_properties', { path: 'Player', names: ['position'] })).text);

    const played = await tools().call('game_input', { steps: [{ action: 'move_forward', ms: 1000 }] });
    const after = zOf((await tools().call('game_get_properties', { path: 'Player', names: ['position'] })).text);

    expect(played.text).toMatch(/^Played 1 input step in \d+ ms\./);
    expect(before - after).toBeGreaterThan(3);
  });

  it('jumps on a key press and lands again', async () => {
    await tools().call('game_input', { steps: [{ key: 'Space' }] });
    const airborne = await tools().call('game_wait', { condition: 'not is_on_floor()', node: 'Player', timeout_ms: 2000 });
    const landed = await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });

    expect(airborne.text).toMatch(/became true/);
    expect(landed.text).toMatch(/^"is_on_floor\(\)" became true on Player/);
  });

  it('suggests the action it did not find', async () => {
    const played = await tools().call('game_input', { steps: [{ action: 'jmp' }] });

    expect(played.isError).toBe(true);
    expect(played.text).toContain('Step 1');
    expect(played.text).toContain('Similar: jump');
  });

  it('removes an action', async () => {
    const changed = await tools().call('input_map_set', { actions: { jump: null } });

    expect(changed.text).toContain('Removed jump (was Space)');
    expect(project?.read('project.godot')).not.toContain('jump={');
  });
});
