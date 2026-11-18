import type { McpSession } from '../../integration/harness.js';
import { agentUsed, type CheckResult, checked, type Scenario, type Vector, vectorIn } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena } from './fixtures.js';

interface Pillar {
  readonly name: string;
  readonly position: Vector;
  readonly turnDegrees: number;
}

const pillars: readonly Pillar[] = [
  { name: 'PillarNorthWest', position: { x: -6, y: 1.6, z: -6 }, turnDegrees: 15 },
  { name: 'PillarNorthEast', position: { x: 6, y: 1.6, z: -6 }, turnDegrees: 30 },
  { name: 'PillarSouthWest', position: { x: -6, y: 1.6, z: 6 }, turnDegrees: 45 },
  { name: 'PillarSouthEast', position: { x: 6, y: 1.6, z: 6 }, turnDegrees: 60 },
];
const pillarSize: Vector = { x: 1.1, y: 3.2, z: 1.1 };
const movedCameraPosition = [0, 10, 16];
const tolerance = 0.001;

function pillarOperations(): Readonly<Record<string, unknown>>[] {
  return [
    { op: 'node_add', type: 'Node3D', name: 'Pillars' },
    ...pillars.map(({ name, position, turnDegrees }) => ({
      op: 'node_add',
      type: 'CSGBox3D',
      name,
      parent: 'Pillars',
      properties: {
        position: [position.x, position.y, position.z],
        rotation_degrees: [0, turnDegrees, 0],
        size: [pillarSize.x, pillarSize.y, pillarSize.z],
        use_collision: true,
        material: { new: 'StandardMaterial3D', albedo_color: [0.62, 0.57, 0.5] },
      },
    })),
  ];
}

function isNear(actual: Vector | undefined, expected: Vector): boolean {
  return actual !== undefined && Math.abs(actual.x - expected.x) < tolerance && Math.abs(actual.y - expected.y) < tolerance && Math.abs(actual.z - expected.z) < tolerance;
}

async function pillarsNotAsTheyWere(tools: McpSession): Promise<string[]> {
  const differing: string[] = [];
  for (const pillar of pillars) {
    const outcome = await tools.call('node_get_properties', { scene: arenaScene, path: `Pillars/${pillar.name}`, names: ['position', 'rotation_degrees', 'size'] });
    const asItWas =
      !outcome.isError &&
      isNear(vectorIn(outcome.text, 'position'), pillar.position) &&
      isNear(vectorIn(outcome.text, 'rotation_degrees'), { x: 0, y: pillar.turnDegrees, z: 0 }) &&
      isNear(vectorIn(outcome.text, 'size'), pillarSize);
    if (!asItWas) {
      differing.push(`${pillar.name}: ${outcome.text.split('\n').slice(0, 4).join(' ')}`);
    }
  }
  return differing;
}

export const bringBackThePillars: Scenario = {
  name: 'bring-back-the-pillars',
  request: 'Earlier you deleted the pillars of the arena by mistake. Bring them back exactly as they were, but leave the camera where it is now.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ tools }) {
    await buildArena(tools, [...arenaOperations(), ...pillarOperations()]);
    await tools.call('node_delete', { paths: ['Pillars'] });
    await tools.call('node_set_properties', { path: 'Camera', properties: { position: movedCameraPosition } });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('editor_undo', { count: 2 });
    await tools.call('node_set_properties', { path: 'Camera', properties: { position: movedCameraPosition } });
    await tools.call('scene_save');
  },
  async check({ project, tools, agent }) {
    const differing = await pillarsNotAsTheyWere(tools);
    const saved = project.read('arena.tscn');
    const savedPillars = pillars.filter(({ name }) => saved.includes(`[node name="${name}" type="CSGBox3D" parent="Pillars"`)).length;
    const savedCamera = /\[node name="Camera" type="Camera3D" parent="\."[^\]]*\]\ntransform = Transform3D\([^)]*, 0, 10, 16\)/.test(saved);
    const checks: CheckResult[] = [
      checked('the four pillars are back with the position, turn and size they had', differing.length === 0, differing.length === 0 ? 'all four as before' : differing.join('; ')),
      checked('the saved arena has the pillars', savedPillars === pillars.length, `${String(savedPillars)} of ${String(pillars.length)} pillars in arena.tscn`),
      checked('the saved arena keeps the camera where it was moved after the deletion', savedCamera, 'Camera in arena.tscn'),
      ...agentUsed(agent, ['editor_undo'], 'the agent took the deletion back with editor_undo'),
    ];
    return checks;
  },
};
