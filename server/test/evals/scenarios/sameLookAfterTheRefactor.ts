import { copyFileSync, mkdirSync } from 'node:fs';
import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, type Scenario } from '../Scenario.js';
import { arenaScene, type Operation } from './fixtures.js';

const crateScene = 'res://props/crate.tscn';
const referenceImage = 'res://.reference/level.png';
const crateCount = 12;
const placedMeters = 0.01;
const view = { position: [0, 9, 13], look_at: [0, 0, -1] };
const positionPattern = /^(?<path>\S+) \([^)]*\) in res:\/\/arena\.tscn\nposition = Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/gm;

interface Placement {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
}

const placements: readonly Placement[] = Array.from({ length: crateCount }, (_, index) => ({
  name: `Crate${String(index + 1)}`,
  position: [((index % 4) - 1.5) * 3, 0.5, (Math.floor(index / 4) - 1) * 3],
  yaw: (index * 15) % 90,
}));

function crateOperations(): Operation[] {
  return placements.map((placement) => ({
    op: 'node_add',
    type: 'MeshInstance3D',
    name: placement.name,
    properties: {
      position: placement.position,
      rotation_degrees: [0, placement.yaw, 0],
      mesh: { new: 'BoxMesh', size: [1, 1, 1], material: { new: 'StandardMaterial3D', albedo_color: '#8a5a2b', roughness: 0.8 } },
    },
  }));
}

const level: Operation[] = [
  { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
  { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } },
  { op: 'node_add', type: 'WorldEnvironment', name: 'Environment', properties: { environment: { new: 'Environment', background_mode: 'Custom Color', background_color: '#40506a' } } },
  ...crateOperations(),
];

async function instancesOfTheCrate(tools: McpSession): Promise<string[]> {
  const found = await tools.call('node_find', { scene: arenaScene, name: '*', max_results: 200 });
  return found.text.split('\n').flatMap((line) => {
    const path = /^(?<path>[^:]+): .*\[instance res:\/\/props\/crate\.tscn/.exec(line.trim())?.groups?.['path'];
    return path === undefined ? [] : [path];
  });
}

async function placedLikeBefore(tools: McpSession, instances: readonly string[]): Promise<CheckResult> {
  if (instances.length === 0) {
    return checked('the crates stand where they stood', false, 'no instance of the crate scene');
  }
  const read = await tools.call('node_get_properties', { scene: arenaScene, paths: instances, names: ['position'] });
  const positions = [...read.text.matchAll(positionPattern)].map((match) => [Number(match.groups?.['x']), Number(match.groups?.['y']), Number(match.groups?.['z'])]);
  const unmatched = placements.filter((placement) => !positions.some((position) => position.every((value, index) => Math.abs(value - (placement.position[index] ?? 0)) < placedMeters)));
  return checked('the crates stand where they stood', unmatched.length === 0, unmatched.length === 0 ? `${String(positions.length)} crates in place` : `no crate at ${unmatched.map((placement) => placement.name).join(', ')}`);
}

export const sameLookAfterTheRefactor: Scenario = {
  name: 'same-look-after-the-refactor',
  request:
    'The twelve crates of the arena are separate MeshInstance3D nodes, each with its own copy of the same mesh and material. Make them instances of one crate scene, res://props/crate.tscn, so that a change of the crate changes them all. The arena must look exactly as it does now.',
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await tools.call('scene_create', { path: arenaScene, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', { operations: level });
    await tools.call('scene_save');
    const shot = await tools.callForImage('editor_screenshot', { views: [view] });
    const captured = /Saved to (?<path>.+)$/m.exec(shot.text)?.groups?.['path'];
    if (captured === undefined) {
      throw new Error(`No reference picture: ${shot.text}`);
    }
    mkdirSync(project.path('.reference'), { recursive: true });
    copyFileSync(captured, project.path('.reference/level.png'));
  },
  async solve({ tools }) {
    const [first, ...others] = placements;
    if (first === undefined) {
      return;
    }
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_save_as_scene', path: first.name, file: crateScene },
        { op: 'node_delete', paths: others.map((placement) => placement.name) },
        ...others.map((placement) => ({ op: 'node_add', type: crateScene, name: placement.name, properties: { position: placement.position, rotation_degrees: [0, placement.yaw, 0] } })),
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const instances = await instancesOfTheCrate(tools);
    await tools.call('scene_open', { path: arenaScene });
    const compared = await tools.callForImage('editor_screenshot', { views: [view], compare_to: referenceImage });
    const comparison = compared.text.split('\n').find((line) => line.startsWith('Compared with')) ?? compared.text.split('\n')[0] ?? '';
    return [
      checked(`the arena holds ${String(crateCount)} instances of res://props/crate.tscn`, instances.length === crateCount, `${String(instances.length)} instances`),
      await placedLikeBefore(tools, instances),
      checked('the arena looks as it did before', comparison.includes('so the pictures match'), comparison),
    ];
  },
};
