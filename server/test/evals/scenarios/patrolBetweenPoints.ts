import { conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildArena, writeScripts } from './fixtures.js';

const walkingDirection = 'Vector3(velocity.x, 0, velocity.z).normalized()';

const enemyScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 2.5',
  '',
  'var _target_index := 0',
  '',
  '@onready var _targets: Array[Marker3D] = [get_node("../PatrolB") as Marker3D, get_node("../PatrolA") as Marker3D]',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tvar target := _targets[_target_index].global_position',
  '\tvar to_target := Vector3(target.x - global_position.x, 0.0, target.z - global_position.z)',
  '\tif to_target.length() < 0.2:',
  '\t\t_target_index = (_target_index + 1) % _targets.size()',
  '\tvar direction := to_target.normalized()',
  '\tvelocity.x = direction.x * SPEED',
  '\tvelocity.z = direction.z * SPEED',
  '\tif direction != Vector3.ZERO:',
  '\t\tlook_at(global_position + direction, Vector3.UP)',
  '\tmove_and_slide()',
  '',
].join('\n');

export const patrolBetweenPoints: Scenario = {
  name: 'patrol-between-points',
  request: 'Make the enemy patrol back and forth between the two markers, facing the way it walks.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ tools }) {
    await buildArena(tools, [
      { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
      { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } },
      { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 12, 12], rotation_degrees: [-45, 0, 0] } },
      { op: 'node_add', type: 'CharacterBody3D', name: 'Enemy' },
      { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Enemy', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
      { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Enemy', properties: { position: [0, 0.9, 0], mesh: { new: 'BoxMesh', size: [0.8, 1.8, 0.8] } } },
      { op: 'node_add', type: 'Marker3D', name: 'PatrolA', properties: { position: [-4, 0, 0] } },
      { op: 'node_add', type: 'Marker3D', name: 'PatrolB', properties: { position: [4, 0, 0] } },
    ]);
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': enemyScript });
    await tools.call('node_set_properties', { scene: arenaScene, path: 'Enemy', properties: { script: 'res://enemy.gd' } });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const tree = await tools.call('scene_get_tree', { scene: arenaScene });
    const enemyLine = tree.text.split('\n').find((line) => line.includes('Enemy: CharacterBody3D')) ?? '';
    const hasScript = /\[script res:\/\//.test(enemyLine);
    const checks = [{ name: 'the enemy has a saved script', passed: hasScript, detail: enemyLine.trim() }, await scriptsAreClean(tools)];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(tools, 'the enemy reaches PatrolB', 'Enemy', 'global_position.distance_to(get_node("../PatrolB").global_position) < 0.5', 15_000),
      await conditionHolds(tools, 'the enemy then walks back to PatrolA', 'Enemy', 'global_position.distance_to(get_node("../PatrolA").global_position) < 0.5', 15_000),
      await conditionHolds(
        tools,
        'the enemy faces the way it walks',
        'Enemy',
        `velocity.length() > 0.5 and max((-global_basis.z).dot(${walkingDirection}), (-get_node("Body").global_basis.z).dot(${walkingDirection})) > 0.9`,
        10_000,
      ),
      await conditionHolds(tools, 'the enemy stays on the floor', 'Enemy', 'is_on_floor() and absf(global_position.y) < 0.2', 5_000),
    );
    return checks;
  },
};
