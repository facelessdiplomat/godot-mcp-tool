import { type CheckResult, checked, conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, writeScripts } from './fixtures.js';

const chaseTimeoutMs = 20_000;
const caughtMeters = 1.6;

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

const level = [
  { op: 'node_add', type: 'NavigationRegion3D', name: 'Mainland', properties: { navigation_mesh: { new: 'NavigationMesh' } } },
  { op: 'node_add', type: 'CSGBox3D', name: 'Floor', parent: 'Mainland', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
  { op: 'node_add', type: 'NavigationRegion3D', name: 'Island', properties: { navigation_mesh: { new: 'NavigationMesh' } } },
  { op: 'node_add', type: 'CSGBox3D', name: 'Floor', parent: 'Island', properties: { size: [8, 1, 8], position: [17, -0.5, 0], use_collision: true } },
  { op: 'node_add', type: 'CSGBox3D', name: 'Bridge', properties: { size: [4, 1, 3], position: [11.5, -0.5, 0], use_collision: true } },
  { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [17, 1, 0] } },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: capsule },
  { op: 'node_add', type: 'CharacterBody3D', name: 'Enemy', properties: { position: [0, 1, -6], script: 'res://enemy.gd' } },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Enemy', properties: capsule },
  { op: 'node_add', type: 'NavigationAgent3D', name: 'Agent', parent: 'Enemy' },
  { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
  { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [8, 18, 18], rotation_degrees: [-45, 0, 0] } },
];

export const reachTheIsland: Scenario = {
  name: 'reach-the-island',
  request: 'The enemy chases the player on the mainland, but never follows the player across the bridge to the island. Find out why and fix it, so that the enemy reaches the player on the island.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': enemyScript });
    await tools.call('scene_create', { path: arenaScene, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', { operations: level });
    await tools.call('navigation_bake');
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_reparent', path: 'Bridge', parent: 'Mainland' },
        { op: 'node_reparent', path: 'Island/Floor', parent: 'Mainland', name: 'IslandFloor' },
        { op: 'node_delete', paths: ['Island'] },
      ],
    });
    await tools.call('navigation_bake');
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const path = await tools.call('navigation_get_path', { scene: arenaScene, from: [0, 0, -6], to: [17, 0, 0] });
    const checks: CheckResult[] = [await scriptsAreClean(tools), checked('the navigation leads from the enemy to the island', path.text.includes('reaches the target'), path.text.split('\n')[0] ?? '')];
    await tools.call('game_run');
    checks.push(await conditionHolds(tools, 'the enemy reaches the player on the island', 'Enemy', `global_position.distance_to(get_node("../Player").global_position) < ${String(caughtMeters)}`, chaseTimeoutMs));
    return checks;
  },
};
