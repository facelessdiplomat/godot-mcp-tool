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
