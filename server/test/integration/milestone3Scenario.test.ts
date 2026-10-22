import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, positionIn, stopDiscoveredEditor, TemporaryProject } from './harness.js';

const testRunTimeoutMs = 120_000;
const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';

const playerScript = [
  'class_name Player',
  'extends CharacterBody3D',
  '',
  'const SPEED := 5.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tvelocity.x = move_toward(velocity.x, 0, SPEED)',
  '\tvelocity.z = move_toward(velocity.z, 0, SPEED)',
  '\tmove_and_slide()',
  '',
].join('\n');

const dashingPlayerScript = [
  'class_name Player',
  'extends CharacterBody3D',
  '',
  'const SPEED := 5.0',
  'const DASH_SPEED := 15.0',
  'const DASH_DURATION := 0.2',
  '',
  'var _dash_time_left := 0.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tif Input.is_action_just_pressed("dash"):',
  '\t\tdash()',
  '\tif _dash_time_left > 0.0:',
  '\t\t_dash_time_left -= delta',
  '\telse:',
  '\t\tvelocity.x = move_toward(velocity.x, 0, SPEED)',
  '\t\tvelocity.z = move_toward(velocity.z, 0, SPEED)',
  '\tmove_and_slide()',
  '',
  '',
  'func dash() -> void:',
  '\tvar forward := -global_basis.z',
  '\tvelocity.x = forward.x * DASH_SPEED',
  '\tvelocity.z = forward.z * DASH_SPEED',
  '\t_dash_time_left = DASH_DURATION',
  '',
].join('\n');

const playerTests = [
  'extends GutTest',
  '',
  'var _player: Player',
  '',
  '',
  'func before_each() -> void:',
  '\t_player = Player.new()',
  '\tadd_child_autofree(_player)',
  '',
  '',
  'func test_dash_moves_forward_at_dash_speed() -> void:',
  '\t_player.dash()',
  '\tassert_almost_eq(_player.velocity.z, -Player.DASH_SPEED, 0.001)',
  '',
  '',
  'func test_dash_ends_after_its_duration() -> void:',
  '\t_player.dash()',
  '\tawait wait_physics_frames(30)',
  '\tassert_almost_eq(Vector2(_player.velocity.x, _player.velocity.z).length(), 0.0, 0.001)',
  '',
].join('\n');

const arenaScene = [
  '[gd_scene load_steps=4 format=3]',
  '',
  '[ext_resource type="Script" path="res://player.gd" id="1_player"]',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_floor"]',
  'size = Vector3(30, 1, 30)',
  '',
  '[sub_resource type="CapsuleShape3D" id="CapsuleShape3D_player"]',
  '',
  '[node name="Arena" type="Node3D"]',
  '',
  '[node name="Floor" type="StaticBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Floor"]',
  'shape = SubResource("BoxShape3D_floor")',
  '',
  '[node name="Player" type="CharacterBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0)',
  'script = ExtResource("1_player")',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Player"]',
  'shape = SubResource("CapsuleShape3D_player")',
  '',
].join('\n');

describe.skipIf(godotBinary === '')('the milestone 3 scenario: a dash with its GUT test, and ice', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;

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

  beforeAll(async () => {
    project = new TemporaryProject('MCP milestone 3', { mainScene: 'res://levels/arena.tscn', testFramework: 'gut' });
    mkdirSync(project.path('levels'));
    project.write('player.gd', playerScript);
    project.write('levels/arena.tscn', arenaScene);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    if (project !== undefined) {
      stopDiscoveredEditor(project.root);
      project.remove();
    }
  });

  it(
    'starts the editor',
    async () => {
      const launched = await tools().call('editor_launch', { headless: !windowed });

      expect(launched.text).toMatch(/^Started the Godot editor/);
    },
    editorStartupTimeoutMs,
  );

  it('adds the dash action on Shift and the B button of a gamepad', async () => {
    const changed = await tools().call('input_map_set', { actions: { dash: ['Shift', { type: 'joypad_button', button: 'b' }] } });
    const listed = await tools().call('input_map_get', { actions: ['dash'] });

    expect(changed.text).toContain('dash: Shift, Joypad b (new)');
    expect(listed.text).toContain('dash: Shift, Joypad b');
    expect(workspace().read('project.godot')).toContain('dash={');
    expect(workspace().read('project.godot').match(/"device": -?\d+/g)).toEqual(['"device": -1', '"device": -1']);
  });

  it('creates a physics material for ice and lays an icy patch with it in the arena', async () => {
    const created = await tools().call('resource_create', { path: 'res://materials/ice.tres', type: 'PhysicsMaterial', properties: { friction: 0.05 } });
    const built = await tools().call('scene_batch_edit', {
      scene: 'res://levels/arena.tscn',
      operations: [
        { op: 'node_add', type: 'StaticBody3D', name: 'IcePatch', properties: { position: [8, 0.05, 0], physics_material_override: 'res://materials/ice.tres' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'IcePatch', properties: { shape: { new: 'BoxShape3D', size: [6, 0.1, 6] } } },
      ],
    });
    const saved = await tools().call('scene_save', { scene: 'res://levels/arena.tscn' });

    expect(created.text).toBe('Created res://materials/ice.tres (PhysicsMaterial).\nApplied: friction');
    expect(built.text).toContain('Applied 2 operations to res://levels/arena.tscn as one Undo step.');
    expect(saved.text).toBe('Saved res://levels/arena.tscn.');
    expect(workspace().read('materials/ice.tres')).toContain('friction = 0.05');
    expect(workspace().read('levels/arena.tscn')).toContain('path="res://materials/ice.tres"');
  });

  it(
    'writes a GUT test for Player.dash() first, and the test does not load before the dash exists',
    async () => {
      mkdirSync(workspace().path('test'));
      workspace().write('test/test_player.gd', playerTests);

      const result = await tools().call('test_run');

      expect(result.text).toMatch(/^No tests ran with GUT in res:\/\/test: 1 test script failed to load\.\n/);
      expect(result.text).toContain('- res://test/test_player.gd:13: Parse Error: Cannot find member "DASH_SPEED" in base "Player".');
      expect(result.text).not.toContain('⚠');
    },
    testRunTimeoutMs,
  );

  it('adds dash() to the player, and both scripts pass the check', async () => {
    workspace().write('player.gd', dashingPlayerScript);
    const rescan = await tools().call('editor_rescan');

    const checked = await tools().call('script_validate', { paths: ['res://player.gd', 'res://test/test_player.gd'] });

    expect(rescan.isError).toBe(false);
    expect(rescan.text).not.toContain('⚠');
    expect(checked.text).toMatch(/^No problems in 2 scripts: res:\/\/player\.gd, res:\/\/test\/test_player\.gd/);
    expect(checked.text).not.toContain('⚠');
  });

  it(
    'runs the GUT tests green',
    async () => {
      const result = await tools().call('test_run');

      expect(result.text).toMatch(/^Ran 2 tests in 1 script with GUT \(res:\/\/test, \d+\.\d s\): all passed\.$/);
    },
    testRunTimeoutMs,
  );

  it('dashes forward in the running game on the dash action', async () => {
    const run = await tools().call('game_run');
    const landed = await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });
    const before = await tools().call('game_get_properties', { path: 'Player', names: ['position'] });

    const dashed = await tools().call('game_input', { steps: [{ action: 'dash' }, { wait_physics_frames: 30 }] });
    const after = await tools().call('game_get_properties', { path: 'Player', names: ['position', 'is_on_floor()'] });

    expect(run.text).toMatch(/^The game is running res:\/\/levels\/arena\.tscn/);
    expect(landed.text).toMatch(/^"is_on_floor\(\)" became true on Player/);
    expect(dashed.text).toMatch(/^Played 2 input steps in \d+ ms\./);
    expect(positionIn(after.text).z).toBeLessThan(positionIn(before.text).z - 2.5);
    expect(after.text).toContain('is_on_floor() = true  [bool]');
  });
});
