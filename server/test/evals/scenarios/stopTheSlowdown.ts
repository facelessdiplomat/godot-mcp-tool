import { agentUsed, checked, conditionHolds, nodeCount, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const turretScript = [
  'extends Node3D',
  '',
  'const Bullet := preload("res://bullet.gd")',
  '',
  '',
  'func _ready() -> void:',
  '\tvar timer := Timer.new()',
  '\ttimer.wait_time = 0.1',
  '\ttimer.autostart = true',
  '\ttimer.timeout.connect(_fire)',
  '\tadd_child(timer)',
  '',
  '',
  'func _fire() -> void:',
  '\tvar bullet := MeshInstance3D.new()',
  '\tbullet.mesh = SphereMesh.new()',
  '\tbullet.scale = Vector3.ONE * 0.2',
  '\tbullet.set_script(Bullet)',
  '\tget_parent().add_child(bullet)',
  '\tbullet.global_position = global_position',
  '',
].join('\n');

const leakingBulletScript = [
  'extends MeshInstance3D',
  '',
  'var velocity := Vector3(0, 0, -20)',
  '',
  '',
  'func _process(delta: float) -> void:',
  '\tposition += velocity * delta',
  '',
].join('\n');

const bulletScript = [
  'extends MeshInstance3D',
  '',
  'const LIFETIME := 2.0',
  '',
  'var velocity := Vector3(0, 0, -20)',
  'var _age := 0.0',
  '',
  '',
  'func _process(delta: float) -> void:',
  '\tposition += velocity * delta',
  '\t_age += delta',
  '\tif _age > LIFETIME:',
  '\t\tqueue_free()',
  '',
].join('\n');

export const stopTheSlowdown: Scenario = {
  name: 'stop-the-slowdown',
  request: 'The game gets slower the longer it runs. Find out why and fix it.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'bullet.gd': leakingBulletScript, 'turret.gd': turretScript });
    await buildArena(tools, [...arenaOperations(), { op: 'node_add', type: 'Node3D', name: 'Turret', properties: { position: [0, 1, 0], script: 'res://turret.gd' } }]);
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'bullet.gd': bulletScript });
  },
  async check({ tools, agent }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 180 });
    const early = await nodeCount(tools);
    await tools.call('game_wait', { physics_frames: 360 });
    const late = await nodeCount(tools);
    const growth = early === undefined || late === undefined ? Number.POSITIVE_INFINITY : late - early;
    checks.push(
      checked('the node count stays level', growth < 20, `${String(early)} nodes after 3 s, ${String(late)} after 9 s`),
      await conditionHolds(tools, 'the turret still fires', '.', 'get_tree().root.find_children("*", "MeshInstance3D", true, false).size() >= 5', 2_000),
      ...agentUsed(agent, ['game_performance'], 'the agent measured the game'),
    );
    return checks;
  },
};
