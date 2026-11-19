import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { changedCellsSchema, type ChangedCells, describeCellTotals, describeChangedCells, describeListedPart, formatCell } from './formatting/gridCells.js';
import { formatNodePath } from './formatting/propertyReports.js';
import { nodePath, sceneToChange, sceneToRead } from './parameters.js';
import { textResult } from './results.js';

const defaultMaxCells = 100;
const largestMaxCells = 10_000;
const largestOrientation = 23;
const turnsAroundY = new Map([
  [16, 90],
  [10, 180],
  [22, 270],
]);

const gridCell = z.tuple([z.number().int(), z.number().int(), z.number().int()]);

const gridMapCellSchema = z.object({ position: gridCell, item: z.number(), name: z.string(), orientation: z.number() });

const gridMapCellsSchema = z.object({
  scene: z.string(),
  path: z.string(),
  library: z.string(),
  items: z.array(z.object({ id: z.number(), name: z.string() })),
  cell_size: z.string(),
  count: z.number(),
  counts: z.array(z.object({ item: z.number(), name: z.string(), count: z.number() })),
  from: gridCell.optional(),
  to: gridCell.optional(),
  cells: z.array(gridMapCellSchema),
  more: z.boolean(),
});

type GridMapCells = z.infer<typeof gridMapCellsSchema>;

const gridMapGetCellsInput = z.object({
  path: nodePath.describe('Path of the GridMap node relative to the scene root, such as "Level/Ground".'),
  from: gridCell.optional().describe('One corner of the box of cells to read, [x, y, z] in cells, such as [-4, 0, -4]. Give "to" with it. Default: every cell.'),
  to: gridCell.optional().describe('The opposite corner of the box, included, such as [3, 0, 3].'),
  max_cells: z.number().int().min(1).max(largestMaxCells).default(defaultMaxCells).describe('The most cells to list; the counts cover every cell.'),
  scene: sceneToRead,
});

export function createGridMapGetCellsTool(projectReader: EditorGateway): BridgeTool<typeof gridMapGetCellsInput, GridMapCells> {
  return new BridgeTool(projectReader, {
    name: 'gridmap_get_cells',
    definition: {
      title: 'Read GridMap cells',
      description:
        'Read the cells of a GridMap: the blocks of its mesh library by name and number, how many cells use each, the box the cells fill and the cells themselves with their block and orientation, ordered by y, then z, then x. Use it to check a level built of blocks, whole or one box at a time. Works without the editor when "scene" is given.',
      inputSchema: gridMapGetCellsInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'gridmap.get_cells',
    responseSchema: gridMapCellsSchema,
    present: (grid, input) => textResult(describeGridMapCells(grid, input)),
  });
}

function describeGridMapCells(grid: GridMapCells, box: z.infer<typeof gridMapGetCellsInput>): string {
  const blocks = grid.library === '' ? 'without a mesh library' : `with the blocks of ${grid.library}: ${grid.items.map((item) => `${item.name} (${String(item.id)})`).join(', ')}`;
  const perBlock = grid.counts.map((block) => `${blockName(block.name, block.item)} ${String(block.count)}`).join(', ');
  const lines = [`${formatNodePath(grid.path)} in ${grid.scene} is a GridMap ${blocks}. Its cells measure ${grid.cell_size}.`, describeCellTotals(grid, box, perBlock)];
  if (grid.count === 0) {
    return lines.join('\n');
  }
  lines.push('Cells, by y, then z, then x:', ...grid.cells.map((cell) => `- ${describeGridMapCell(cell)}`));
  if (grid.more) {
    lines.push(describeListedPart(grid.cells.length, grid.count));
  }
  return lines.join('\n');
}

function describeGridMapCell(cell: z.infer<typeof gridMapCellSchema>): string {
  const block = `${formatCell(cell.position)} ${blockName(cell.name, cell.item)}`;
  if (cell.orientation <= 0) {
    return block;
  }
  const turn = turnsAroundY.get(cell.orientation);
  return turn === undefined ? `${block}, orientation ${String(cell.orientation)}` : `${block}, turned ${String(turn)}° around y (orientation ${String(cell.orientation)})`;
}

const settableItem = z
  .union([z.string().min(1), z.number().int().min(0), z.null()])
  .describe('The block: its name in the mesh library, such as "Wall", or its number; null erases the cells.');

const settableOrientation = z
  .number()
  .int()
  .min(0)
  .max(largestOrientation)
  .optional()
  .describe('How the block is turned, as an orthogonal index from 0 to 23. Turned around y: 0 for 0°, 16 for 90°, 10 for 180°, 22 for 270°. Default: 0, as in the mesh library.');

const gridMapSetCellsInput = z.object({
  path: nodePath.describe('Path of the GridMap node relative to the scene root, such as "Level/Ground".'),
  boxes: z
    .array(z.object({ from: gridCell.describe('One corner, [x, y, z] in cells.'), to: gridCell.describe('The opposite corner, included.'), item: settableItem, orientation: settableOrientation }))
    .optional()
    .describe('Boxes of cells to fill with one block each, in order, so that a later box paints over an earlier one: a floor from [-4, 0, -4] to [3, 0, 3] is 64 cells; a ring of walls is a box of walls with a floor box inside it.'),
  cells: z
    .array(z.object({ position: gridCell.describe('The cell, [x, y, z] in cells.'), item: settableItem, orientation: settableOrientation }))
    .optional()
    .describe('Single cells to set after the boxes.'),
  scene: sceneToChange,
});

export function createGridMapSetCellsTool(editor: EditorGateway): BridgeTool<typeof gridMapSetCellsInput, ChangedCells> {
  return new BridgeTool(editor, {
    name: 'gridmap_set_cells',
    definition: {
      title: 'Paint GridMap cells',
      description:
        'Put blocks of the mesh library of a GridMap on its cells, or erase them, as one Undo step: whole boxes of cells, such as a floor or a wall, and single cells, with blocks named as in the library. Cells are whole numbers on the grid, not meters: cell [x, y, z] sits at [x, y, z] times cell_size. Read the blocks and cells with gridmap_get_cells first.',
      inputSchema: gridMapSetCellsInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'gridmap.set_cells',
    responseSchema: changedCellsSchema,
    present: (result) => textResult(describeChangedCells(result)),
  });
}

function blockName(name: string, item: number): string {
  return name === '' ? `item ${String(item)}` : name;
}

const libraryItemSchema = z.object({ id: z.number(), name: z.string(), mesh: z.string(), shapes: z.number(), navigation: z.boolean(), added: z.boolean() });

const meshLibrarySchema = z.object({
  path: z.string(),
  scene: z.string(),
  created: z.boolean(),
  items: z.array(libraryItemSchema),
  left: z.array(z.object({ id: z.number(), name: z.string() })),
  duplicates: z.array(z.string()),
  previews: z.boolean(),
});

type MeshLibraryReport = z.infer<typeof meshLibrarySchema>;

const meshLibraryCreateInput = z.object({
  scene: z
    .string()
    .min(1)
    .describe(
      'The saved scene of the blocks, such as "res://blocks/blocks.tscn": every MeshInstance3D in it with a mesh becomes a block named after the node, with the collision shapes of its StaticBody3D children and the navigation mesh of a NavigationRegion3D child.',
    ),
  path: z.string().min(1).describe('The MeshLibrary file to write, such as "res://blocks/blocks.tres".'),
  update: z
    .boolean()
    .default(false)
    .describe(
      'Update the library at path: blocks keep their ids by name, new blocks get new ids, and blocks the scene no longer has stay. Needed when the file exists, since the cells of a GridMap store the ids.',
    ),
  apply_transforms: z
    .boolean()
    .default(false)
    .describe(
      'Keep the transform that each block has in the scene, such as a rotation, in its item. Default: false, as the Import from Scene of the editor does, so blocks laid out side by side in the scene each sit in the middle of their cell.',
    ),
});

export function createMeshLibraryCreateTool(editor: EditorGateway): BridgeTool<typeof meshLibraryCreateInput, MeshLibraryReport> {
  return new BridgeTool(editor, {
    name: 'meshlibrary_create',
    definition: {
      title: 'Make a MeshLibrary',
      description:
        "Build the MeshLibrary of a GridMap from a scene of blocks, as the editor's Scene → Export As → MeshLibrary does: each MeshInstance3D with a mesh becomes an item named after the node, with its mesh and materials, the collision shapes of its StaticBody3D children and the navigation mesh of a NavigationRegion3D child. update: true changes an existing library and keeps the ids of its items, which the cells of a GridMap store. Then set mesh_library of the GridMap to the file and paint it with gridmap_set_cells. Save the scene of the blocks first; needs the editor.",
      inputSchema: meshLibraryCreateInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'meshlibrary.create',
    responseSchema: meshLibrarySchema,
    present: (library) => textResult(describeMeshLibrary(library)),
  });
}

function describeMeshLibrary(library: MeshLibraryReport): string {
  const added = library.items.filter((item) => item.added).length;
  const kept = library.items.length - added;
  const lines = [
    library.created
      ? `Created ${library.path} from ${library.scene} with ${countOf(library.items.length, 'block')}:`
      : `Updated ${library.path} from ${library.scene}: ${String(added)} new ${added === 1 ? 'block' : 'blocks'}, ${String(kept)} kept ${kept === 1 ? 'its id' : 'their ids'}.`,
    ...library.items.map((item) => `- ${describeLibraryItem(item, !library.created)}`),
  ];
  if (library.left.length > 0) {
    lines.push(`Still in the library, though the scene has no block of that name: ${library.left.map((item) => `${item.name} (${String(item.id)})`).join(', ')}.`);
  }
  for (const name of library.duplicates) {
    lines.push(`Several MeshInstance3D nodes are named ${name}; the last one became the block.`);
  }
  if (!library.previews) {
    lines.push('No previews: the editor runs without a window, so the GridMap palette shows the names of the blocks.');
  }
  lines.push('Give it to a GridMap as its mesh_library and paint the blocks by name with gridmap_set_cells.');
  return lines.join('\n');
}

function describeLibraryItem(item: z.infer<typeof libraryItemSchema>, marksNew: boolean): string {
  const shapes = item.shapes === 0 ? 'no collision shape' : countOf(item.shapes, 'collision shape');
  const navigation = item.navigation ? ', a navigation mesh' : '';
  return `${item.name} (${String(item.id)}${marksNew && item.added ? ', new' : ''}): ${item.mesh}, ${shapes}${navigation}`;
}

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
