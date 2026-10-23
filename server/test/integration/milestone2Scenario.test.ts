import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, positionIn, stopDiscoveredEditor, TemporaryProject } from './harness.js';
import { decodePng } from './pngImage.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';

const playerScript = (speedName: string): string =>
  [
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
    '\tvar input_direction := Input.get_vector("move_left", "move_right", "move_forward", "move_back")',
    '\tvar direction := (transform.basis * Vector3(input_direction.x, 0, input_direction.y)).normalized()',
    '\tif direction != Vector3.ZERO:',
    `\t\tvelocity.x = direction.x * ${speedName}`,
    `\t\tvelocity.z = direction.z * ${speedName}`,
    '\telse:',
    '\t\tvelocity.x = move_toward(velocity.x, 0, SPEED)',
    '\t\tvelocity.z = move_toward(velocity.z, 0, SPEED)',
    '\tmove_and_slide()',
    '',
  ].join('\n');

describe.skipIf(godotBinary === '')('the milestone 2 scenario: a third-person prototype', () => {
  let project: TemporaryProject | undefined;
  let session: McpSession | undefined;
  let startZ = 0;

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
    project = new TemporaryProject('MCP milestone 2');
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

  it('sets up the input actions for WASD and Space', async () => {
    const actions = await tools().call('input_map_set', {
      actions: { move_forward: ['W'], move_back: ['S'], move_left: ['A'], move_right: ['D'], jump: ['Space'] },
    });

    expect(actions.isError).toBe(false);
    expect(actions.text).toContain('jump: Space (new)');
  });

  it('catches a broken player script before running it', async () => {
    workspace().write('player.gd', playerScript('SPED'));

    const checked = await tools().call('script_validate', { paths: ['res://player.gd'] });

    expect(checked.text).toContain('2 errors in 1 of 1 script');
    expect(checked.text).toMatch(/res:\/\/player\.gd\n {2}15(:\d+)? error[^:]*: .*SPED/);
    expect(checked.text).not.toContain('⚠');
  });

  it('accepts the fixed player script', async () => {
    workspace().write('player.gd', playerScript('SPEED'));
    const rescan = await tools().call('editor_rescan');

    const checked = await tools().call('script_validate', { paths: ['res://player.gd'] });

    expect(rescan.text).not.toContain('⚠');
    expect(checked.text).toMatch(/^No problems in 1 script: res:\/\/player\.gd/);
    expect(checked.text).not.toContain('⚠');
  });

  it('builds the arena with the player in one batch and makes it the main scene', async () => {
    await tools().call('scene_create', { path: 'res://levels/arena.tscn', root_type: 'Node3D' });

    const built = await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [30, 1, 30], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } },
        {
          op: 'node_add',
          type: 'WorldEnvironment',
          name: 'Environment',
          properties: { environment: { new: 'Environment', background_mode: 'Sky', sky: { new: 'Sky', sky_material: { new: 'ProceduralSkyMaterial' } } } },
        },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 1.5, 0], script: 'res://player.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: { shape: { new: 'CapsuleShape3D' } } },
        { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Player', properties: { mesh: { new: 'CapsuleMesh' } } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', parent: 'Player', properties: { position: [0, 2, 5], rotation_degrees: [-15, 0, 0] } },
      ],
    });
    const settings = await tools().call('project_settings_set', { values: { 'application/run/main_scene': 'res://levels/arena.tscn' } });
    const saved = await tools().call('scene_save');

    expect(built.isError).toBe(false);
    expect(built.text).toContain('Applied 7 operations to res://levels/arena.tscn as one Undo step.');
    expect(settings.isError).toBe(false);
    expect(saved.isError).toBe(false);
  });

  it('runs the game and lands the player on the floor', async () => {
    const run = await tools().call('game_run');
    const landed = await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });
    const before = await tools().call('game_get_properties', { path: 'Player', names: ['position'] });

    expect(run.text).toMatch(/^The game is running res:\/\/levels\/arena\.tscn/);
    expect(landed.text).toMatch(/^"is_on_floor\(\)" became true on Player/);
    startZ = positionIn(before.text).z;
  });

  it('walks forward while move_forward is held for a second', async () => {
    const played = await tools().call('game_input', { steps: [{ action: 'move_forward', ms: 1000 }] });
    const after = await tools().call('game_get_properties', { path: 'Player', names: ['position', 'is_on_floor()'] });

    expect(played.text).toMatch(/^Played 1 input step in \d+ ms \(\d+ physics frames?\)\./);
    expect(positionIn(after.text).z).toBeLessThan(startZ - 3);
    expect(after.text).toContain('is_on_floor() = true  [bool]');
  });

  it.skipIf(!windowed)('renders the arena from two angles', async () => {
    const rendered = await tools().callForImage('game_screenshot', { views: ['front', { preset: 'iso', target: 'Player' }] });

    expect(rendered.text).toContain('Views of the running game (res://levels/arena.tscn), 1280×358, left to right and top to bottom: front, iso of Player.');
    expect(rendered.image).toBeDefined();
    expect(decodePng(rendered.image ?? Buffer.alloc(0)).width).toBe(1280);
  });

  it('jumps on Space and is on the floor again after landing', async () => {
    const jumped = await tools().call('game_input', { steps: [{ key: 'Space' }, { wait_ms: 150 }] });
    const inTheAir = await tools().call('game_get_properties', { path: 'Player', names: ['is_on_floor()'] });
    const landed = await tools().call('game_wait', { condition: 'is_on_floor()', node: 'Player', timeout_ms: 5000 });

    expect(jumped.isError).toBe(false);
    expect(inTheAir.text).toContain('is_on_floor() = false  [bool]');
    expect(landed.text).toMatch(/^"is_on_floor\(\)" became true on Player/);
  });
});
