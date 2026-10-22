import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScript = ['extends Node3D', '', '', 'func _ready() -> void:', '\tvar bullet := Node3D.new()', '\tbullet.name = "Bullet"', '\tadd_child(bullet)', ''].join('\n');

const playerScript = [
  'extends CharacterBody3D',
  '',
  'var speed := 5.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tmove_and_slide()',
  '',
].join('\n');

const mainScene = [
  '[gd_scene load_steps=5 format=3]',
  '',
  '[ext_resource type="Script" path="res://main.gd" id="1_main"]',
  '[ext_resource type="Script" path="res://player.gd" id="2_player"]',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_floor"]',
  'size = Vector3(20, 1, 20)',
  '',
  '[sub_resource type="CapsuleShape3D" id="CapsuleShape3D_player"]',
  '',
  '[node name="Main" type="Node3D"]',
  'script = ExtResource("1_main")',
  '',
  '[node name="Floor" type="StaticBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Floor"]',
  'shape = SubResource("BoxShape3D_floor")',
  '',
  '[node name="Player" type="CharacterBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0)',
  'script = ExtResource("2_player")',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Player"]',
  'shape = SubResource("CapsuleShape3D_player")',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('looking into the running game', () => {
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
    project = new TemporaryProject('MCP game inspection', { mainScene: 'res://main.tscn' });
    project.write('main.gd', mainScript);
    project.write('player.gd', playerScript);
    project.write('main.tscn', mainScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
    await session.call('game_run');
  }, editorStartupTimeoutMs + 60_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('shows the tree with the nodes the game created', async () => {
    const tree = await tools().call('game_get_tree');

    expect(tree.isError).toBe(false);
    expect(tree.text).toContain('The running game, current scene res://main.tscn');
    expect(tree.text).toContain('Player: CharacterBody3D [script res://player.gd]');
    expect(tree.text).toContain('Bullet: Node3D');
  });

  it('shows the autoloads from the root of the tree', async () => {
    const tree = await tools().call('game_get_tree', { path: '/root', max_depth: 1 });

    expect(tree.text).toContain('GodotMcpRuntime: Node');
    expect(tree.text).toContain('Main: Node3D');
  });

  it('waits until the player lands and reads its state', async () => {
    const waited = await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });
    const properties = await tools().call('game_get_properties', { path: 'Player', names: ['position', 'is_on_floor()', 'speed'] });

    expect(waited.text).toMatch(/^"is_on_floor\(\)" became true on Player after \d+ ms/);
    expect(properties.text).toContain('Player (CharacterBody3D) in the running game');
    expect(properties.text).toContain('is_on_floor() = true  [bool]');
    expect(properties.text).toContain('speed = 5  [float]');
    expect(properties.text).toMatch(/position = Vector3\(0, (0\.9\d*|1(\.0\d*)?), 0\)/);
  });

  it('moves the player while the game runs', async () => {
    const moved = await tools().call('game_set_properties', { path: 'Player', properties: { position: [2, 1, 0] } });
    const waited = await tools().call('game_wait', { physics_frames: 5 });
    const properties = await tools().call('game_get_properties', { path: 'Player', names: ['position'] });

    expect(moved.text).toContain('Updated Player in the running game.');
    expect(waited.text).toMatch(/^Waited 5 physics frames/);
    expect(properties.text).toMatch(/position = Vector3\(2, /);
  });

  it('suggests node paths it did not find', async () => {
    const missing = await tools().call('game_get_properties', { path: 'Playr' });

    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Similar: Player');
  });

  it('refuses once the game has stopped', async () => {
    await tools().call('game_stop');

    const tree = await tools().call('game_get_tree');

    expect(tree.isError).toBe(true);
    expect(tree.text).toContain('The game is not running');
  });
});
