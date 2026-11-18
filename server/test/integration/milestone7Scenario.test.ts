import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lowestCornersOfCube, placementIn } from '../support/placement.js';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject } from './harness.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';
const hillScene = 'res://hill.tscn';
const crateCount = 10;
const crateHalfSize = 0.25;
const cubeFaceCorners = 4;
const groundTolerance = 0.01;
const crateNames = Array.from({ length: crateCount }, (_, index) => `Crate${String(index + 1)}`);
const vectorPattern = /Vector3\((?<x>-?[\d.e-]+), (?<y>-?[\d.e-]+), (?<z>-?[\d.e-]+)\)/;

const walkerScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 2.0',
  '',
  'var steps := 0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tvelocity.x = SPEED',
  '\tmove_and_slide()',
  '\t$AnimationTree.set("parameters/move/blend_position", Vector2(get_real_velocity().x, get_real_velocity().z).length())',
  '',
  '',
  'func _on_footstep() -> void:',
  '\tsteps += 1',
  '',
].join('\n');

const crateScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_crate"]',
  'size = Vector3(0.5, 0.5, 0.5)',
  '',
  '[node name="Crate" type="MeshInstance3D"]',
  'mesh = SubResource("BoxMesh_crate")',
  '',
].join('\n');

const hudScene = [
  '[gd_scene format=3]',
  '',
  '[node name="Hud" type="Control"]',
  'layout_mode = 3',
  'anchors_preset = 15',
  'anchor_right = 1.0',
  'anchor_bottom = 1.0',
  '',
  '[node name="Health" type="ProgressBar" parent="."]',
  'layout_mode = 1',
  'anchors_preset = 3',
  'anchor_left = 1.0',
  'anchor_top = 1.0',
  'anchor_right = 1.0',
  'anchor_bottom = 1.0',
  'offset_left = -260.0',
  'offset_top = -60.0',
  'offset_right = -20.0',
  'offset_bottom = -20.0',
  'value = 75.0',
  '',
].join('\n');

function vectorIn(text: string, after: string): { x: number; y: number; z: number } {
  const start = text.indexOf(after);
  const match = vectorPattern.exec(text.slice(start + after.length));
  if (start < 0 || match?.groups === undefined) {
    throw new Error(`No vector after "${after}" in: ${text}`);
  }
  return { x: Number(match.groups['x']), y: Number(match.groups['y']), z: Number(match.groups['z']) };
}

function numberIn(text: string, name: string): number {
  const match = new RegExp(`${name.replaceAll('/', '\\/')} = (?<value>-?[\\d.e-]+)`).exec(text);
  if (match?.groups === undefined) {
    throw new Error(`No ${name} in: ${text}`);
  }
  return Number(match.groups['value']);
}

describe.skipIf(godotBinary === '')('the milestone 7 scenario: crates on the hill, a solid rock, footsteps, walking blended into running and the HUD at two sizes', () => {
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
    project = new TemporaryProject('MCP milestone 7', { mainScene: hillScene });
    project.write('walker.gd', walkerScript);
    project.write('crate.tscn', crateScene);
    project.write('hud.tscn', hudScene);
    editorProcess = windowed ? await startWindowedEditor(project.root) : await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
    await session.call('scene_create', { path: hillScene, root_type: 'Node3D' });
    await session.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [40, 1, 40], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 6, 14], rotation_degrees: [-20, 0, 0] } },
        { op: 'node_add', type: 'MeshInstance3D', name: 'Hill', properties: { position: [0, 1.5, -8], mesh: { new: 'PrismMesh', size: [8, 3, 6] } } },
        { op: 'node_add_collision', path: 'Hill', shape: 'trimesh' },
        { op: 'node_add', type: 'MeshInstance3D', name: 'Rock', properties: { position: [12, 0.75, 0], mesh: { new: 'SphereMesh', radius: 0.75, height: 1.5 } } },
        { op: 'node_add_collision', path: 'Rock', shape: 'convex' },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Walker', properties: { position: [0, 0.05, 0], script: 'res://walker.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Walker', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4 } } },
        { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Walker', properties: { position: [0, 0.9, 0], mesh: { new: 'CapsuleMesh', radius: 0.4 } } },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer', parent: 'Walker' },
        { op: 'node_add', type: 'AnimationTree', name: 'AnimationTree', parent: 'Walker' },
        ...crateNames.map((name, index) => ({ op: 'node_add', type: 'res://crate.tscn', name, properties: { position: [-3.6 + index * 0.8, 9, -8] } })),
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

  it('lays every crate flat on the hill, with the four corners of its bottom within a centimeter of the slope', async () => {
    const snapped = await tools().call('node_snap_to_floor', { paths: crateNames, align: true });
    await tools().call('scene_save');

    expect(snapped.text.split('\n').filter((line) => line.includes('to the surface below it') && line.includes('rests on Hill'))).toHaveLength(crateCount);
    for (const name of crateNames) {
      const properties = await tools().call('node_get_properties', { path: name, names: ['transform'] });
      const placement = placementIn(properties.text, 'transform');

      expect(placement).toBeDefined();
      for (const corner of placement === undefined ? [] : lowestCornersOfCube(placement, crateHalfSize, cubeFaceCorners)) {
        const ground = await tools().call('scene_raycast', { from: [corner.x, corner.y + 1, corner.z], exclude: [name] });
        const hit = vectorIn(ground.text, ' at ');

        expect(ground.text).toContain('hits Hill');
        expect(Math.abs(corner.y - hit.y)).toBeLessThan(groundTolerance);
      }
    }
  });

  it('gives the rock a collision that stops the walker in the running game', async () => {
    await tools().call('animation_set', {
      player: 'Walker/AnimationPlayer',
      name: 'walk',
      length: 1,
      loop: 'linear',
      tracks: [
        { path: 'Body:position:y', keys: [{ time: 0, value: 0.9 }, { time: 0.5, value: 1 }, { time: 1, value: 0.9 }] },
        { type: 'method', path: '.', keys: [{ time: 0.25, method: '_on_footstep' }, { time: 0.75, method: '_on_footstep' }] },
      ],
    });
    await tools().call('animation_set', {
      player: 'Walker/AnimationPlayer',
      name: 'run',
      length: 0.5,
      loop: 'linear',
      tracks: [{ path: 'Body:position:y', keys: [{ time: 0, value: 0.9 }, { time: 0.25, value: 1.1 }, { time: 0.5, value: 0.9 }] }],
    });
    const tree = await tools().call('animation_tree_set', {
      tree: 'Walker/AnimationTree',
      player: 'Walker/AnimationPlayer',
      states: [{ name: 'move', blend: [{ animation: 'walk', at: 2 }, { animation: 'run', at: 6 }], min: 0, max: 6 }],
      transitions: [{ from: 'Start', to: 'move' }],
    });
    await tools().call('scene_save');
    await tools().call('game_run');

    const walking = await tools().call('game_input', {
      steps: [{ wait_physics_frames: 15 }, { read: 'Walker/AnimationTree', names: ['parameters/move/blend_position'] }, { read: 'Walker', names: ['steps'] }, { wait_physics_frames: 60 }, { read: 'Walker', names: ['steps'] }],
    });
    const blocked = await tools().call('game_wait', { node: 'Walker', condition: 'is_on_wall()', timeout_ms: 10_000 });
    await tools().call('game_wait', { physics_frames: 30 });
    const stopped = await tools().call('game_get_properties', { path: 'Walker', names: ['position', 'steps'] });
    const blendAtTheRock = await tools().call('game_get_properties', { path: 'Walker/AnimationTree', names: ['parameters/move/blend_position'] });
    const stepCounts = [...walking.text.matchAll(/steps = (?<count>\d+)/g)].map((match) => Number(match.groups?.['count']));

    expect(tree.text).toContain('move (blends walk at 2 and run at 6 by parameters/move/blend_position, from 0 to 6)');
    expect(numberIn(walking.text, 'parameters/move/blend_position')).toBeCloseTo(2, 1);
    expect(stepCounts).toHaveLength(2);
    expect((stepCounts[1] ?? 0) - (stepCounts[0] ?? 0)).toBe(2);
    expect(blocked.text).toContain('became true');
    expect(vectorIn(stopped.text, 'position = ').x).toBeLessThan(11);
    expect(vectorIn(stopped.text, 'position = ').x).toBeGreaterThan(10.5);
    expect(numberIn(stopped.text, 'steps')).toBeGreaterThanOrEqual(6);
    expect(numberIn(blendAtTheRock.text, 'parameters/move/blend_position')).toBeLessThan(0.1);
  });

  it.skipIf(!windowed)('shows the HUD at 16:9 and at 4:3 in one image', async () => {
    await tools().call('scene_open', { path: 'res://hud.tscn' });

    const hud = await tools().callForImage('editor_screenshot', { sizes: [[1920, 1080], [1440, 1080]] });
    const health = await tools().call('node_get_bounds', { path: 'Health' });

    expect(hud.text).toContain('Render of res://hud.tscn at 1920×1080 (16:9); 1440×1080 (4:3)');
    expect(hud.image).toBeDefined();
    expect(health.text).toContain('It lies inside the Vector2(1152, 648) window of the project.');
  });
});
