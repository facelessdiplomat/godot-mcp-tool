import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, conditionHolds, findNodes, type Scenario, scriptsAreClean, type Vector } from '../Scenario.js';
import { arenaScene, buildPrototype, type Operation, writeScripts } from './fixtures.js';

const shortestRailMeters = 20;
const railToleranceMeters = 1;
const lowestSpeed = 1.5;
const highestSpeed = 4.5;
const samples = 7;
const framesBetweenSamples = 10;
const physicsFramesPerSecond = 60;
const readTimeoutMs = 2_000;
const vectorPattern = /global_position = Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/g;

const followScript = ['extends PathFollow3D', '', 'const SPEED := 3.0', '', '', 'func _process(delta: float) -> void:', '\tprogress += SPEED * delta', ''].join('\n');

const cart: Operation[] = [
  { op: 'node_add', type: 'Node3D', name: 'Cart', properties: { position: [0, 0, 0] } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Cart', properties: { position: [0, 0.4, 0], mesh: { new: 'BoxMesh', size: [1.2, 0.8, 2] } } },
];

function sampledPositions(text: string): Vector[] {
  return [...text.matchAll(vectorPattern)].map((match) => ({ x: Number(match.groups?.['x']), y: Number(match.groups?.['y']), z: Number(match.groups?.['z']) }));
}

function travelled(positions: readonly Vector[]): number {
  return positions.slice(1).reduce((total, position, index) => {
    const previous = positions[index] ?? position;
    return total + Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z);
  }, 0);
}

async function railChecks(tools: McpSession, rail: string | undefined): Promise<CheckResult[]> {
  if (rail === undefined) {
    return [checked('the arena has a Path3D', false, 'no Path3D in the arena')];
  }
  const closedLoop = 'curve.closed or curve.get_point_position(0).distance_to(curve.get_point_position(curve.point_count - 1)) < 0.5';
  return [
    await conditionHolds(tools, 'the rail is a closed loop', rail, `curve != null and curve.point_count >= 3 and (${closedLoop})`, readTimeoutMs),
    await conditionHolds(tools, `the rail is longer than ${String(shortestRailMeters)} m`, rail, `curve.get_baked_length() > ${String(shortestRailMeters)}`, readTimeoutMs),
  ];
}

async function cartChecks(tools: McpSession, rail: string, cartPath: string): Promise<CheckResult[]> {
  const cartInScene = `get_tree().current_scene.get_node("${cartPath}").global_position`;
  const onRail = await conditionHolds(tools, 'the cart is on the rail', rail, `curve.get_closest_point(to_local(${cartInScene})).distance_to(to_local(${cartInScene})) < ${String(railToleranceMeters)}`, readTimeoutMs);
  const steps = Array.from({ length: samples }, (_, index) => [
    ...(index === 0 ? [] : [{ wait_physics_frames: framesBetweenSamples }]),
    { read: cartPath, names: ['global_position'] },
  ]).flat();
  const played = await tools.call('game_input', { steps });
  const seconds = ((samples - 1) * framesBetweenSamples) / physicsFramesPerSecond;
  const speed = travelled(sampledPositions(played.text)) / seconds;
  return [
    onRail,
    checked(`the cart rides at about 3 m/s (${String(lowestSpeed)} to ${String(highestSpeed)})`, speed >= lowestSpeed && speed <= highestSpeed, `${speed.toFixed(2)} m/s`),
  ];
}

export const rideTheRail: Scenario = {
  name: 'ride-the-rail',
  request: 'Make the cart ride around the arena forever at about 3 m/s on a closed rail: a Path3D along the inside of the walls that the cart follows.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, { operations: cart });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'cart_follow.gd': followScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        {
          op: 'node_add',
          type: 'Path3D',
          name: 'Rail',
          properties: {
            curve: {
              new: 'Curve3D',
              point_count: 4,
              'point_0/position': [-8, 0, -8],
              'point_1/position': [8, 0, -8],
              'point_2/position': [8, 0, 8],
              'point_3/position': [-8, 0, 8],
              closed: true,
            },
          },
        },
        { op: 'node_add', type: 'PathFollow3D', name: 'Follow', parent: 'Rail', properties: { script: 'res://cart_follow.gd' } },
        { op: 'node_reparent', path: 'Cart', parent: 'Rail/Follow', keep_global_transform: false },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const [rail] = await findNodes(tools, arenaScene, { type: 'Path3D' });
    const follows = await findNodes(tools, arenaScene, { type: 'PathFollow3D' });
    const [cartPath] = await findNodes(tools, arenaScene, { name: 'Cart' });
    const checks: CheckResult[] = [await scriptsAreClean(tools), checked('a PathFollow3D follows the rail', rail !== undefined && follows.some((follow) => follow.startsWith(`${rail}/`)), follows.join(', '))];
    await tools.call('game_run');
    checks.push(...(await railChecks(tools, rail)));
    if (rail !== undefined && cartPath !== undefined) {
      checks.push(...(await cartChecks(tools, rail, cartPath)));
    }
    return checks;
  },
};
