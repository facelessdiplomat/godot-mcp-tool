import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, findNodes, gameVector, horizontalDistance, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, type Operation, writeScripts } from './fixtures.js';

const ballPath = 'Ball';
const impactRadiusMeters = 2.5;
const burstTimeoutMs = 8_000;
const hitTimeoutMs = 15_000;

const ballScript = [
  'extends RigidBody3D',
  '',
  'signal hit_wall(point: Vector3)',
  '',
  'const LAUNCH_DELAY := 3.0',
  'const LAUNCH_SPEED := 8.0',
  '',
  '',
  'func _ready() -> void:',
  '\tcontact_monitor = true',
  '\tmax_contacts_reported = 4',
  '\tbody_entered.connect(_on_body_entered)',
  '\tget_tree().create_timer(LAUNCH_DELAY).timeout.connect(_launch)',
  '',
  '',
  'func _launch() -> void:',
  '\tlinear_velocity = Vector3(0, 0, -LAUNCH_SPEED)',
  '',
  '',
  'func _on_body_entered(body: Node) -> void:',
  '\tif body.name.begins_with("Wall"):',
  '\t\thit_wall.emit(global_position + Vector3(0, 0, -0.5))',
  '',
].join('\n');

const refereeScript = [
  'extends Node',
  '',
  'var frames_with_sparks_before_hit := 0',
  'var _hit := false',
  '',
  '',
  'func _ready() -> void:',
  '\tget_node("../Ball").connect("hit_wall", _on_hit_wall)',
  '',
  '',
  'func _physics_process(_delta: float) -> void:',
  '\tif _hit:',
  '\t\treturn',
  '\tfor particles in get_tree().current_scene.find_children("*", "GPUParticles3D", true, false):',
  '\t\tif (particles as GPUParticles3D).emitting:',
  '\t\t\tframes_with_sparks_before_hit += 1',
  '',
  '',
  'func _on_hit_wall(_point: Vector3) -> void:',
  '\t_hit = true',
  '',
].join('\n');

const sparksScript = [
  'extends GPUParticles3D',
  '',
  '',
  'func _ready() -> void:',
  '\tget_node("../Ball").connect("hit_wall", _on_ball_hit_wall)',
  '',
  '',
  'func _on_ball_hit_wall(point: Vector3) -> void:',
  '\tglobal_position = point',
  '\trestart()',
  '',
].join('\n');

const ball: Operation[] = [
  { op: 'node_add', type: 'RigidBody3D', name: 'Ball', properties: { position: [0, 0.5, 0], script: 'res://ball.gd' } },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Ball', properties: { shape: { new: 'SphereShape3D', radius: 0.5 } } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Mesh', parent: 'Ball', properties: { mesh: { new: 'SphereMesh', radius: 0.5, height: 1 } } },
  { op: 'node_add', type: 'Node', name: 'Referee', properties: { script: 'res://referee.gd' } },
];

function propertyLine(text: string, name: string): string {
  return text.split('\n').find((line) => line.startsWith(`${name} = `)) ?? `${name}: not set`;
}

async function particlesAreSetUp(tools: McpSession, path: string | undefined): Promise<CheckResult[]> {
  if (path === undefined) {
    return [checked('the arena has a GPUParticles3D node', false, 'no GPUParticles3D in the arena')];
  }
  const properties = await tools.call('node_get_properties', { scene: arenaScene, path, names: ['one_shot', 'process_material', 'draw_pass_1'] });
  const material = propertyLine(properties.text, 'process_material');
  return [
    checked('the particles burst once (one_shot)', properties.text.includes('one_shot = true'), propertyLine(properties.text, 'one_shot')),
    checked('the particles have a process material and a mesh to draw', !material.includes('null') && material.includes(' = ') && !propertyLine(properties.text, 'draw_pass_1').includes('null'), `${material}; ${propertyLine(properties.text, 'draw_pass_1')}`),
  ];
}

async function burstsOnlyOnTheHit(tools: McpSession, path: string): Promise<CheckResult[]> {
  await tools.call('game_run');
  await tools.call('game_pause', { paused: true });
  const hit = await tools.call('game_wait', { node: ballPath, signal: 'hit_wall', timeout_ms: hitTimeoutMs });
  const ballPosition = await gameVector(tools, ballPath, 'global_position');
  const referee = await tools.call('game_get_properties', { path: 'Referee', names: ['frames_with_sparks_before_hit'] });
  const burst = await tools.call('game_wait', { node: path, signal: 'finished', timeout_ms: burstTimeoutMs });
  const sparksPosition = await gameVector(tools, path, 'global_position');
  const distance = ballPosition === undefined || sparksPosition === undefined ? Number.NaN : horizontalDistance(ballPosition, sparksPosition);
  return [
    checked('the ball hits the wall', !hit.isError && hit.text.includes('emitted'), hit.text.split('\n')[0] ?? ''),
    checked('the sparks do not burst before the ball hits the wall', referee.text.includes('frames_with_sparks_before_hit = 0'), propertyLine(referee.text, 'frames_with_sparks_before_hit')),
    checked('the sparks burst once after the hit', !burst.isError && burst.text.includes('emitted finished'), burst.text.split('\n')[0] ?? ''),
    checked('the sparks burst where the ball hits the wall', distance < impactRadiusMeters, `${distance.toFixed(2)} m from the ball`),
  ];
}

export const sparksOnImpact: Scenario = {
  name: 'sparks-on-impact',
  request:
    'When the ball hits the wall, it emits hit_wall(point). Make a burst of sparks appear at that point when it happens: a one-shot GPUParticles3D effect that does not run before the hit.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, { scripts: { 'ball.gd': ballScript, 'referee.gd': refereeScript }, operations: ball });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'sparks.gd': sparksScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        {
          op: 'node_add',
          type: 'GPUParticles3D',
          name: 'Sparks',
          properties: {
            one_shot: true,
            emitting: false,
            amount: 32,
            lifetime: 0.6,
            explosiveness: 1,
            process_material: { new: 'ParticleProcessMaterial', direction: [0, 0, 1], spread: 60, initial_velocity_min: 2, initial_velocity_max: 5 },
            draw_pass_1: { new: 'SphereMesh', radius: 0.05, height: 0.1 },
            script: 'res://sparks.gd',
          },
        },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const [particles] = await findNodes(tools, arenaScene, { type: 'GPUParticles3D' });
    const checks: CheckResult[] = [await scriptsAreClean(tools), ...(await particlesAreSetUp(tools, particles))];
    if (particles !== undefined) {
      checks.push(...(await burstsOnlyOnTheHit(tools, particles)));
    }
    return checks;
  },
};
