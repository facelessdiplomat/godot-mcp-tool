import { type CheckResult, checked, conditionHolds, type Scenario } from '../Scenario.js';

const courtyardScene = 'res://courtyard.tscn';
const floorItem = 0;
const wallItem = 1;
const floorFrom = -4;
const floorTo = 3;
const readTimeoutMs = 3_000;
const cellsPattern = /"cells": PackedInt32Array\((?<values>[^)]*)\)/;
const sixteenBits = 0xffff;

const blocksLibrary = [
  '[gd_resource type="MeshLibrary" load_steps=3 format=3]',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_floor"]',
  'size = Vector3(2, 0.2, 2)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_wall"]',
  'size = Vector3(2, 2, 2)',
  '',
  '[resource]',
  'item/0/name = "Floor"',
  'item/0/mesh = SubResource("BoxMesh_floor")',
  'item/1/name = "Wall"',
  'item/1/mesh = SubResource("BoxMesh_wall")',
  '',
].join('\n');

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly item: number;
}

function sideOfCourtyard(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function expectedCells(): Cell[] {
  const inside = sideOfCourtyard(floorFrom, floorTo);
  const withRing = sideOfCourtyard(floorFrom - 1, floorTo + 1);
  return withRing.flatMap((x) =>
    withRing.map((z) => ({ x, y: 0, z, item: inside.includes(x) && inside.includes(z) ? floorItem : wallItem })),
  );
}

function signed16(value: number): number {
  return (value << 16) >> 16;
}

function cellsIn(sceneText: string): Cell[] {
  const values = cellsPattern.exec(sceneText)?.groups?.['values']?.trim() ?? '';
  const numbers = values === '' ? [] : values.split(',').map((value) => Number(value.trim()));
  const cells: Cell[] = [];
  for (let index = 0; index + 2 < numbers.length; index += 3) {
    const position = numbers[index] ?? 0;
    cells.push({ x: signed16(position & sixteenBits), y: signed16((position >>> 16) & sixteenBits), z: signed16((numbers[index + 1] ?? 0) & sixteenBits), item: (numbers[index + 2] ?? 0) & sixteenBits });
  }
  return cells;
}

function keyOf(cell: Cell): string {
  return `${String(cell.x)},${String(cell.y)},${String(cell.z)}`;
}

export const paveTheCourtyard: Scenario = {
  name: 'pave-the-courtyard',
  request:
    "In res://courtyard.tscn, pave the courtyard: put the Floor block of the GridMap's mesh library on every cell from (-4, 0, -4) to (3, 0, 3), and a Wall block on every cell of the ring around them.",
  projectOptions: { mainScene: courtyardScene },
  async prepare({ project, tools }) {
    project.write('blocks.tres', blocksLibrary);
    await tools.call('editor_rescan');
    await tools.call('scene_create', { path: courtyardScene, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'GridMap', name: 'Courtyard', properties: { mesh_library: 'res://blocks.tres' } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 18, 18], rotation_degrees: [-45, 0, 0] } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('gridmap_set_cells', {
      scene: courtyardScene,
      path: 'Courtyard',
      boxes: [
        { from: [floorFrom - 1, 0, floorFrom - 1], to: [floorTo + 1, 0, floorTo + 1], item: 'Wall' },
        { from: [floorFrom, 0, floorFrom], to: [floorTo, 0, floorTo], item: 'Floor' },
      ],
    });
    await tools.call('scene_save', { scene: courtyardScene });
  },
  async check({ project, tools }) {
    const saved = new Map(cellsIn(project.read('courtyard.tscn')).map((cell) => [keyOf(cell), cell]));
    const expected = expectedCells();
    const floors = expected.filter((cell) => cell.item === floorItem);
    const walls = expected.filter((cell) => cell.item === wallItem);
    const matching = (cells: readonly Cell[]): number => cells.filter((cell) => saved.get(keyOf(cell))?.item === cell.item).length;
    const checks: CheckResult[] = [
      checked('the saved scene has a Floor block on each of the 64 cells', matching(floors) === floors.length, `${String(matching(floors))} of ${String(floors.length)} floor cells`),
      checked('the saved scene has a Wall block on each of the 36 cells around them', matching(walls) === walls.length, `${String(matching(walls))} of ${String(walls.length)} wall cells`),
      checked('the GridMap holds those 100 cells and no others', saved.size === expected.length, `${String(saved.size)} cells in the saved scene`),
    ];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(
        tools,
        'the running game has the same floor and walls',
        'Courtyard',
        `get_used_cells_by_item(${String(floorItem)}).size() == ${String(floors.length)} and get_used_cells_by_item(${String(wallItem)}).size() == ${String(walls.length)}`,
        readTimeoutMs,
      ),
    );
    return checks;
  },
};
