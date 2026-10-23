import type { ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  editorStartupTimeoutMs,
  exportPresetsFor,
  findFreePort,
  godotBinary,
  hostExportPlatform,
  McpSession,
  startHeadlessEditor,
  startWindowedEditor,
  TemporaryProject,
  testProjectRoot,
} from './harness.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';
const characterFixture = join(testProjectRoot, 'tests', 'fixtures', 'models', 'character.glb');
const breakpointLine = 23;

const enemyScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 3.0',
  '',
  '@onready var agent: NavigationAgent3D = $Agent',
  '@onready var animation_tree: AnimationTree = $AnimationTree',
  '@onready var player: Node3D = get_node("../Player")',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tagent.target_position = player.global_position',
  '\tvar direction := Vector3.ZERO',
  '\tif not agent.is_navigation_finished():',
  '\t\tdirection = global_position.direction_to(agent.get_next_path_position())',
  '\tdirection.y = 0.0',
  '\tdirection = direction.normalized()',
  '\tvelocity.x = direction.x * SPEED',
  '\tvelocity.z = direction.z * SPEED',
  '\tmove_and_slide()',
  '\tvar moving := Vector2(velocity.x, velocity.z).length() > 0.1',
  '\tanimation_tree.set("parameters/conditions/moving", moving)',
  '\tanimation_tree.set("parameters/conditions/stopped", not moving)',
  '',
].join('\n');

const playerCapsule = { shape: { new: 'CapsuleShape3D' } };

function scaleIn(propertiesText: string): number[] {
  const match = /scale = Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/.exec(propertiesText);
  return [Number(match?.groups?.['x']), Number(match?.groups?.['y']), Number(match?.groups?.['z'])];
}
const currentState = (state: string): string => `get("parameters/playback").get_current_node() == "${state}"`;

describe.skipIf(godotBinary === '' || hostExportPlatform === undefined)('the milestone 4 scenario: an imported enemy that walks to the player', () => {
  const platform = hostExportPlatform ?? { name: '', folder: '', file: '' };
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
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
    project = new TemporaryProject('MCP milestone 4', { mainScene: 'res://levels/arena.tscn' });
    mkdirSync(project.path('imports'));
    mkdirSync(project.path('enemies'));
    copyFileSync(characterFixture, project.path('imports/character.glb'));
    project.write('enemies/enemy.gd', enemyScript);
    project.write('export_presets.cfg', exportPresetsFor(platform));
    const debugAdapterPort = await findFreePort();
    editorProcess = windowed ? await startWindowedEditor(project.root, { debugAdapter: debugAdapterPort }) : await startHeadlessEditor(project.root, { debugAdapter: debugAdapterPort });
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary, GODOT_DAP_PORT: String(debugAdapterPort) });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('scales the imported character to 1.8 m', async () => {
    const changed = await tools().call('asset_import_settings_set', {
      path: 'res://imports/character.glb',
      options: { 'nodes/root_scale': 0.01 },
    });

    expect(changed.text).toContain('Imported scene: size Vector3(0.5, 1.8, 0.5) (was Vector3(50, 180, 50))');
  });

  it('builds the enemy from the model, a capsule, a navigation agent and an idle and a walk animation', async () => {
    await tools().call('scene_create', { path: 'res://enemies/enemy.tscn', root_type: 'CharacterBody3D' });
    const built = await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_set_properties', path: '.', properties: { script: 'res://enemies/enemy.gd' } },
        { op: 'node_add', type: 'res://imports/character.glb', name: 'Model' },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.25, height: 1.8 } } },
        { op: 'node_add', type: 'NavigationAgent3D', name: 'Agent' },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
        { op: 'node_add', type: 'AnimationTree', name: 'AnimationTree' },
      ],
    });
    const idle = await tools().call('animation_set', {
      player: 'AnimationPlayer',
      name: 'idle',
      loop: 'pingpong',
      tracks: [{ path: 'Model:scale:y', keys: [{ time: 0, value: 1 }, { time: 1, value: 1.03 }] }],
    });
    const walk = await tools().call('animation_set', {
      player: 'AnimationPlayer',
      name: 'walk',
      loop: 'linear',
      tracks: [{ path: 'Model:rotation_degrees:z', keys: [{ time: 0, value: -4 }, { time: 0.4, value: 4 }, { time: 0.8, value: -4 }] }],
    });
    const states = await tools().call('animation_tree_set', {
      tree: 'AnimationTree',
      player: 'AnimationPlayer',
      states: [
        { name: 'idle', animation: 'idle' },
        { name: 'walk', animation: 'walk' },
      ],
      transitions: [
        { from: 'Start', to: 'idle' },
        { from: 'idle', to: 'walk', condition: 'moving', xfade: 0.2 },
        { from: 'walk', to: 'idle', condition: 'stopped', xfade: 0.2 },
      ],
    });
    const saved = await tools().call('scene_save');

    expect(built.text).toContain('Applied 6 operations to res://enemies/enemy.tscn as one Undo step.');
    expect(idle.text).toContain('Keyed the current value of Model:scale:y in RESET');
    expect(walk.text).toContain('Keyed the current value of Model:rotation_degrees:z in RESET');
    expect(states.text).toContain('Set up the state machine of AnimationTree in res://enemies/enemy.tscn');
    expect(saved.isError).toBe(false);
  });

  it('builds an arena with a wall between the enemy and the player and bakes its navigation mesh', async () => {
    await tools().call('scene_create', { path: 'res://levels/arena.tscn', root_type: 'Node3D' });
    await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'NavigationRegion3D', name: 'Navigation', properties: { navigation_mesh: { new: 'NavigationMesh' } } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', parent: 'Navigation', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Wall', parent: 'Navigation', properties: { size: [10, 2, 1], position: [0, 1, 0], use_collision: true } },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 1, 6] } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: playerCapsule },
        { op: 'node_add', type: 'res://enemies/enemy.tscn', name: 'Enemy', properties: { position: [0, 1, -6] } },
      ],
    });

    const baked = await tools().call('navigation_bake');
    const saved = await tools().call('scene_save');

    expect(baked.text).toContain('Baked the navigation mesh of Navigation in res://levels/arena.tscn as one Undo step');
    expect(saved.isError).toBe(false);
  });

  it('walks the enemy around the wall to the player in the running game, playing its walk animation', async () => {
    const run = await tools().call('game_run');
    const walking = await tools().call('game_wait', { condition: currentState('walk'), node: 'Enemy/AnimationTree', timeout_ms: 10_000 });
    await tools().call('game_wait', { physics_frames: 30 });
    const modelWhileWalking = await tools().call('game_get_properties', { path: 'Enemy/Model', names: ['scale'] });
    const arrived = await tools().call('game_wait', { condition: 'global_position.distance_to(get_node("../Player").global_position) < 1.6', node: 'Enemy', timeout_ms: 20_000 });

    expect(run.text).toMatch(/^The game is running res:\/\/levels\/arena\.tscn/);
    expect(run.text).not.toContain('⚠');
    expect(walking.text).toMatch(/became true on Enemy\/AnimationTree/);
    expect(scaleIn(modelWhileWalking.text)[1]).toBeCloseTo(1, 1);
    expect(arrived.text).toMatch(/became true on Enemy/);
  });

  it('stops the enemy at a breakpoint, shows its variables and lets it run on', async () => {
    const added = await tools().call('debug_breakpoints', { add: [`res://enemies/enemy.gd:${String(breakpointLine)}`] });
    const state = await tools().call('debug_state', { wait_ms: 5000 });
    await tools().call('debug_breakpoints', { remove: [`res://enemies/enemy.gd:${String(breakpointLine)}`] });
    const continued = await tools().call('debug_continue');

    expect(added.text).toContain(`- res://enemies/enemy.gd:${String(breakpointLine)}  animation_tree.set("parameters/conditions/moving", moving)`);
    expect(state.text).toMatch(new RegExp(`^The game stopped at a breakpoint at res://enemies/enemy\\.gd:${String(breakpointLine)} in _physics_process\\.`));
    expect(state.text).toMatch(/\n- direction = /);
    expect(state.text).toMatch(/\n- moving = (true|false)/);
    expect(continued.text).toBe('The game continues. debug_state with wait_ms waits for it to stop at the next breakpoint.');
    await tools().call('game_stop');
  });

  it('moves the imported art into its own folder, and the enemy keeps its model', async () => {
    const usages = await tools().call('resource_find_usages', { path: 'res://imports/character.glb' });
    const moved = await tools().call('filesystem_move', { from: 'res://imports', to: 'res://art' });
    const tree = await tools().call('scene_get_tree', { scene: 'res://enemies/enemy.tscn' });
    const run = await tools().call('game_run');

    expect(usages.text).toContain('Used by:\n- res://enemies/enemy.tscn');
    expect(moved.text).toMatch(/^Moved the folder res:\/\/imports\/ with 1 file to res:\/\/art\/\./);
    expect(moved.text).toContain('Updated the paths in: res://enemies/enemy.tscn');
    expect(tree.text).toContain('[instance res://art/character.glb]');
    expect(run.text).toMatch(/^The game is running res:\/\/levels\/arena\.tscn/);
    expect(run.text).not.toContain('⚠');
    await tools().call('game_stop');
  });

  it('exports the game data as a pack into a build folder the editor ignores', async () => {
    const exported = await tools().call('export_project', { mode: 'pack' });

    expect(exported.text).toMatch(new RegExp(`^Exported the preset "${platform.name}" \\(${platform.name}, pack\\) to build/${platform.folder}/game\\.pck in [\\d.]+ s:\\n- game\\.pck`));
    expect(existsSync(workspace().path(`build/${platform.folder}/game.pck`))).toBe(true);
    expect(existsSync(workspace().path('build/.gdignore'))).toBe(true);
  });
});
