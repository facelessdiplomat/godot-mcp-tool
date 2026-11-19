import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, conditionHolds, findNodes, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, keyboardActions, type Operation, playerOperations, playerScript, writeScripts } from './fixtures.js';

const hingeLine = '-1.0, 1.05, -10.5';
const gateHeight = 1.05;
const openedRadians = 0.35;
const closedRadians = 0.1;
const onPostMeters = 0.35;
const readTimeoutMs = 3_000;
const settleFrames = 30;
const pushMs = 1_500;

const gapInTheNorthWall: Operation[] = [
  { op: 'node_delete', paths: ['WallNorth'] },
  { op: 'node_add', type: 'CSGBox3D', name: 'WallNorthWest', properties: { size: [10, 3, 1], position: [-6, 1.5, -10.5], use_collision: true } },
  { op: 'node_add', type: 'CSGBox3D', name: 'WallNorthEast', properties: { size: [10, 3, 1], position: [6, 1.5, -10.5], use_collision: true } },
  { op: 'node_add', type: 'StaticBody3D', name: 'Post', properties: { position: [-1.15, 1.5, -10.5] } },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Post', properties: { shape: { new: 'BoxShape3D', size: [0.3, 3, 0.3] } } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Mesh', parent: 'Post', properties: { mesh: { new: 'BoxMesh', size: [0.3, 3, 0.3] } } },
  { op: 'node_add', type: 'RigidBody3D', name: 'Gate', properties: { position: [0, gateHeight, -10.5], mass: 10 } },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Gate', properties: { shape: { new: 'BoxShape3D', size: [1.9, 2, 0.15] } } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Mesh', parent: 'Gate', properties: { mesh: { new: 'BoxMesh', size: [1.9, 2, 0.15] } } },
];

const pushingPlayerScript = playerScript(
  ['const PUSH_STRENGTH := 0.4'],
  [],
).replace(
  '\tmove_and_slide()\n',
  [
    '\tmove_and_slide()',
    '\tfor index in get_slide_collision_count():',
    '\t\tvar collision := get_slide_collision(index)',
    '\t\tvar body := collision.get_collider() as RigidBody3D',
    '\t\tif body != null:',
    '\t\t\tbody.apply_impulse(-collision.get_normal() * PUSH_STRENGTH, collision.get_position() - body.global_position)',
    '',
  ].join('\n'),
);

async function hingeChecks(tools: McpSession): Promise<CheckResult> {
  const hinges = await findNodes(tools, arenaScene, { type: 'HingeJoint3D' });
  for (const hinge of hinges) {
    const properties = await tools.call('node_get_properties', { scene: arenaScene, path: hinge, names: ['node_a', 'node_b'] });
    const ends = properties.text.split('\n').slice(1).join(' ');
    if (/Post/.test(ends) && /Gate/.test(ends)) {
      return checked('a HingeJoint3D joins the post and the gate', true, `${hinge}: ${ends}`);
    }
  }
  return checked('a HingeJoint3D joins the post and the gate', false, hinges.length === 0 ? 'no HingeJoint3D in the arena' : hinges.join(', '));
}

export const swingTheGate: Scenario = {
  name: 'swing-the-gate',
  request:
    'Hang the gate in the gap of the north wall on a hinge at its post, so that the player can push it open by walking into it. The gate must stay on its post, and it must stay closed until it is pushed.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'player.gd': playerScript() });
    await tools.call('input_map_set', { actions: keyboardActions });
    await buildArena(tools, [...arenaOperations(), ...playerOperations(), ...gapInTheNorthWall]);
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'player.gd': pushingPlayerScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [{ op: 'node_add', type: 'HingeJoint3D', name: 'Hinge', properties: { position: [-1.0, gateHeight, -10.5], rotation_degrees: [-90, 0, 0], node_a: 'Post', node_b: 'Gate' } }],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks: CheckResult[] = [await scriptsAreClean(tools), await hingeChecks(tools)];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: settleFrames });
    checks.push(await conditionHolds(tools, 'the gate stays closed before it is pushed', 'Gate', `rotation.length() < ${String(closedRadians)}`, readTimeoutMs));
    await tools.call('game_set_properties', { path: 'Player', properties: { global_position: [0.3, 0, -8.5] } });
    await tools.call('game_input', { steps: [{ action: 'move_forward', ms: pushMs }] });
    checks.push(
      await conditionHolds(tools, 'the player pushes the gate open', 'Gate', `absf(rotation.y) > ${String(openedRadians)}`, readTimeoutMs),
      await conditionHolds(tools, 'the gate stays on its post', 'Gate', `to_global(Vector3(-0.95, 0, 0)).distance_to(Vector3(${hingeLine})) < ${String(onPostMeters)} and absf(global_position.y - ${String(gateHeight)}) < 0.3`, readTimeoutMs),
    );
    return checks;
  },
};
