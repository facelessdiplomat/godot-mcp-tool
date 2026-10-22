import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const enemyScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 4.0',
  '',
  '@onready var agent: NavigationAgent3D = $Agent',
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
  '',
].join('\n');

const capsule = { shape: { new: 'CapsuleShape3D' } };

describe.skipIf(godotBinary === '')('baking navigation for an enemy that follows the player', () => {
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
    project = new TemporaryProject('MCP navigation bake');
    project.write('enemy.gd', enemyScript);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('builds an arena with a wall between the enemy and the player', async () => {
    await tools().call('editor_rescan');
    await tools().call('scene_create', { path: 'res://arena.tscn', root_type: 'Node3D' });

    const built = await tools().call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'NavigationRegion3D', name: 'Navigation', properties: { navigation_mesh: { new: 'NavigationMesh' } } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', parent: 'Navigation', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Wall', parent: 'Navigation', properties: { size: [10, 2, 1], position: [0, 1, 0], use_collision: true } },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 1, 6] } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: capsule },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Enemy', properties: { position: [0, 1, -6], script: 'res://enemy.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Enemy', properties: capsule },
        { op: 'node_add', type: 'NavigationAgent3D', name: 'Agent', parent: 'Enemy' },
      ],
    });

    expect(built.text).toContain('Applied 8 operations to res://arena.tscn as one Undo step.');
  });

  it('bakes the navigation mesh from the CSG floor and wall added just before', async () => {
    const baked = await tools().call('navigation_bake');

    expect(baked.isError).toBe(false);
    expect(baked.text).toContain('Baked the navigation mesh of Navigation in res://arena.tscn as one Undo step; the scene has unsaved changes.');
    expect(baked.text).toMatch(/- Navigation: \d+ polygons from Vector3\(-9\.5, [\d.]+, -9\.5\) to Vector3\(9\.5, [\d.]+, 9\.5\), for an agent of radius 0\.5 and height 1\.5/);
  });

  it('lets the enemy walk around the wall to the player in the running game', async () => {
    await tools().call('scene_save');
    const run = await tools().call('game_run', { scene: 'res://arena.tscn' });

    const reached = await tools().call('game_wait', { condition: 'global_position.distance_to(get_node("../Player").global_position) < 1.6', node: 'Enemy', timeout_ms: 20_000 });

    expect(run.text).toMatch(/^The game is running res:\/\/arena\.tscn/);
    expect(reached.text).toMatch(/became true on Enemy/);
  });
});
