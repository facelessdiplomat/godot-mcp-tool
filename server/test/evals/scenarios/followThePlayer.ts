import { agentUsed, checked, conditionHolds, findNodes, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildArena, type Operation, writeScripts } from './fixtures.js';

const chaserScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 3.0',
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

function arenaWithWall(): Operation[] {
  return [
    { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
    { op: 'node_add', type: 'CSGBox3D', name: 'Wall', properties: { size: [10, 2, 1], position: [0, 1, 0], use_collision: true } },
    { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
    { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 16, 10], rotation_degrees: [-55, 0, 0] } },
    { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 0, 6] } },
    { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
    { op: 'node_add', type: 'CharacterBody3D', name: 'Enemy', properties: { position: [0, 0, -6] } },
    { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Enemy', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
    { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Enemy', properties: { position: [0, 0.9, 0], mesh: { new: 'BoxMesh', size: [0.8, 1.8, 0.8] } } },
  ];
}

export const followThePlayer: Scenario = {
  name: 'follow-the-player',
  request: 'Bake navigation for the arena and make the enemy follow the player around the wall.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ tools }) {
    await buildArena(tools, arenaWithWall());
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': chaserScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add', type: 'NavigationRegion3D', name: 'Navigation', properties: { navigation_mesh: { new: 'NavigationMesh' } } },
        { op: 'node_reparent', path: 'Floor', parent: 'Navigation' },
        { op: 'node_reparent', path: 'Wall', parent: 'Navigation' },
        { op: 'node_add', type: 'NavigationAgent3D', name: 'Agent', parent: 'Enemy' },
        { op: 'node_set_properties', path: 'Enemy', properties: { script: 'res://enemy.gd' } },
      ],
    });
    await tools.call('navigation_bake');
    await tools.call('scene_save');
  },
  async check({ tools, agent }) {
    const regions = await findNodes(tools, arenaScene, { type: 'NavigationRegion3D' });
    const agents = await findNodes(tools, arenaScene, { type: 'NavigationAgent3D' });
    const checks = [
      checked('the arena has a navigation region', regions.length > 0, regions.join(', ') || 'none'),
      checked('the enemy has a navigation agent', agents.some((path) => path.startsWith('Enemy/')), agents.join(', ') || 'none'),
      await scriptsAreClean(tools),
    ];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(tools, 'the enemy reaches the player around the wall', 'Enemy', 'global_position.distance_to(get_node("../Player").global_position) < 1.6', 20_000),
      ...agentUsed(agent, ['navigation_bake'], 'the agent baked the navigation mesh with navigation_bake'),
    );
    return checks;
  },
};
