import type { McpSession } from '../../integration/harness.js';
import { lowestCornersOfCube, placementIn } from '../../support/placement.js';
import { type CheckResult, checked, gameVector, type Scenario } from '../Scenario.js';
import { arenaScene, buildPrototype, type Operation } from './fixtures.js';

const crateScenePath = 'res://crate.tscn';
const crateCount = 10;
const crateHalfSize = 0.25;
const cubeFaceCorners = 4;
const rockSurfaceX = 3 - 0.75;
const playerRadius = 0.4;
const groundTolerance = 0.01;
const vectorPattern = /Vector3\((?<x>-?[\d.e-]+), (?<y>-?[\d.e-]+), (?<z>-?[\d.e-]+)\)/;

const crateScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_crate"]',
  'size = Vector3(0.5, 0.5, 0.5)',
  '',
  '[node name="Crate" type="MeshInstance3D"]',
  'mesh = SubResource("BoxMesh_crate")',
  '',
].join('\n');

const hillAndRock: Operation[] = [
  { op: 'node_add', type: 'MeshInstance3D', name: 'Hill', properties: { position: [0, 1.5, -5], mesh: { new: 'PrismMesh', size: [8, 3, 6] } } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Rock', properties: { position: [3, 0.75, 4], mesh: { new: 'SphereMesh', radius: 0.75, height: 1.5 } } },
];

function vectorAfter(text: string, marker: string): { x: number; y: number; z: number } | undefined {
  const start = text.indexOf(marker);
  const groups = start < 0 ? undefined : vectorPattern.exec(text.slice(start + marker.length))?.groups;
  return groups === undefined ? undefined : { x: Number(groups['x']), y: Number(groups['y']), z: Number(groups['z']) };
}

async function cratePaths(tools: McpSession): Promise<string[]> {
  const found = await tools.call('node_find', { scene: arenaScene, name: '*', max_results: 500 });
  return found.text.split('\n').flatMap((line) => {
    const path = /^(?<path>[^:]+): .*\[instance res:\/\/crate\.tscn/.exec(line.trim())?.groups?.['path'];
    return path === undefined ? [] : [path];
  });
}

async function liesFlatOnTheHill(tools: McpSession, path: string): Promise<boolean> {
  const properties = await tools.call('game_get_properties', { path, names: ['global_transform'] });
  const placement = placementIn(properties.text, 'global_transform');
  if (placement === undefined) {
    return false;
  }
  for (const corner of lowestCornersOfCube(placement, crateHalfSize, cubeFaceCorners)) {
    const ground = await tools.call('scene_raycast', { from: [corner.x, corner.y + 1, corner.z], exclude: [path], in_game: true });
    const hit = vectorAfter(ground.text, ' at ');
    if (!ground.text.includes('hits Hill') || hit === undefined || Math.abs(corner.y - hit.y) >= groundTolerance) {
      return false;
    }
  }
  return true;
}

export const cratesOnTheHill: Scenario = {
  name: 'crates-on-the-hill',
  request: 'Put ten crates from res://crate.tscn on the hill so that each one rests on the ground, and give the rock a collision that the player cannot walk through.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    project.write('crate.tscn', crateScene);
    await buildPrototype(project, tools, { operations: hillAndRock });
  },
  async solve({ tools }) {
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add_collision', path: 'Hill', shape: 'trimesh' },
        { op: 'node_add_collision', path: 'Rock', shape: 'convex' },
        ...Array.from({ length: crateCount }, (_, index) => ({ op: 'node_add', type: crateScenePath, name: `Crate${String(index + 1)}`, properties: { position: [-3.6 + index * 0.8, 8, -5] } })),
      ],
    });
    await tools.call('node_snap_to_floor', { scene: arenaScene, paths: Array.from({ length: crateCount }, (_, index) => `Crate${String(index + 1)}`), align: true });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const crates = await cratePaths(tools);
    await tools.call('game_run');
    const lyingFlat: string[] = [];
    for (const crate of crates) {
      if (await liesFlatOnTheHill(tools, crate)) {
        lyingFlat.push(crate);
      }
    }
    const checks: CheckResult[] = [
      checked('there are ten crates from res://crate.tscn', crates.length === crateCount, `${String(crates.length)} instances of res://crate.tscn`),
      checked(
        'every crate lies flat on the hill, the corners of its bottom within a centimeter of the slope',
        crates.length > 0 && lyingFlat.length === crates.length,
        `${String(lyingFlat.length)} of ${String(crates.length)} lie flat on the hill`,
      ),
    ];
    await tools.call('game_input', { steps: [{ action: 'move_right', physics_frames: 90 }] });
    const player = await gameVector(tools, 'Player', 'position');
    checks.push(
      checked(
        'the rock stops the player',
        player !== undefined && player.x < rockSurfaceX - playerRadius + 0.2,
        player === undefined ? 'no player position' : `the player stopped at x = ${player.x.toFixed(2)}`,
      ),
    );
    return checks;
  },
};
