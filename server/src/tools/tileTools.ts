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

const pair = z.tuple([z.number().int(), z.number().int()]);

const tileSetAddAtlasInput = z.object({
  path: z.string().min(1).describe('The TileSet file to create or add to, such as "res://tiles/ground.tres".'),
  texture: z.string().min(1).describe('The image of the tiles, such as "res://tiles.png", as the editor imported it.'),
  tile_size: z.tuple([z.number().int().min(1), z.number().int().min(1)]).describe('The size of one tile in pixels, [width, height], such as [32, 32]. A new TileSet takes it as its tile_size.'),
  collision: z
    .boolean()
    .optional()
    .describe('Give every tile a full square collision polygon on physics layer 0, added when the TileSet has none, so that bodies stand on the tiles. Default: false.'),
  margins: pair.optional().describe('Pixels to skip at the left and the top of the texture before the first tile. Default: [0, 0].'),
  separation: pair.optional().describe('Pixels between neighboring tiles in the texture. Default: [0, 0].'),
});

const addedAtlasSchema = z.object({
  path: z.string(),
  created: z.boolean(),
  source_id: z.number(),
  texture: z.string(),
  tile_size: pair,
  columns: z.number(),
  rows: z.number(),
  tiles: z.number(),
  skipped: z.number(),
  collision: z.number(),
});

type AddedAtlas = z.infer<typeof addedAtlasSchema>;

export function createTileSetAddAtlasTool(editor: EditorGateway): BridgeTool<typeof tileSetAddAtlasInput, AddedAtlas> {
  return new BridgeTool(editor, {
    name: 'tileset_add_atlas',
    definition: {
      title: 'Add a tile atlas',
      description:
        'Cut a texture into tiles and add them to a TileSet as one atlas source, creating the TileSet file when it does not exist, and save it: every tile of the given size that is not empty, each with a full square collision when asked, so that bodies stand on it. This is how a 2D level of tiles starts: then give the TileSet to a TileMapLayer and paint its cells with tilemap_set_cells.',
      inputSchema: tileSetAddAtlasInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'tileset.add_atlas',
    responseSchema: addedAtlasSchema,
    present: (added) => textResult(describeAddedAtlas(added)),
  });
}

function describeAddedAtlas(added: AddedAtlas): string {
  const size = `${String(added.tile_size[0])}×${String(added.tile_size[1])}`;
  const tiles = `${plural(added.tiles, 'tile')} of ${added.texture}`;
  const grid = `in ${plural(added.columns, 'column')} and ${plural(added.rows, 'row')}`;
  const skipped = added.skipped > 0 ? `, leaving out ${plural(added.skipped, 'empty cell')}` : '';
  const collision = added.collision > 0 ? 'Each tile collides as a full square on physics layer 0.' : 'The tiles have no collision.';
  const source = String(added.source_id);
  const summary = added.created
    ? `Created ${added.path}, a TileSet of ${size} tiles, with source ${source}: ${tiles} ${grid}${skipped}. ${collision}`
    : `Added source ${source} to ${added.path}: ${tiles}, ${size} each, ${grid}${skipped}. ${collision}`;
  const usage = `Give it to a TileMapLayer with node_set_properties, such as {"tile_set": "${added.path}"}, and paint with tilemap_set_cells, such as {"atlas": [0, 0], "source": ${source}}.`;
  return [summary, usage].join('\n');
}

const tileSourceSchema = z.object({
  id: z.number(),
  kind: z.enum(['atlas', 'scenes']),
  texture: z.string().optional(),
  columns: z.number().optional(),
  rows: z.number().optional(),
  tiles: z.number(),
  collision_tiles: z.number().optional(),
});

type TileSource = z.infer<typeof tileSourceSchema>;

const tileMapCellSchema = z.object({ position: pair, source: z.number(), atlas: pair, alternative: z.number() });

const tileMapCellsSchema = z.object({
  scene: z.string(),
  path: z.string(),
  tile_set: z.string().nullable(),
  tile_size: pair.optional(),
  physics_layers: z.number().optional(),
  sources: z.array(tileSourceSchema),
  count: z.number(),
  counts: z.array(z.object({ source: z.number(), atlas: pair, count: z.number() })),
  from: pair.optional(),
  to: pair.optional(),
  cells: z.array(tileMapCellSchema),
  more: z.boolean(),
});

type TileMapCells = z.infer<typeof tileMapCellsSchema>;

const tileMapGetCellsInput = z.object({
  path: nodePath.describe('Path of the TileMapLayer node relative to the scene root, such as "Level/Ground".'),
  from: pair.optional().describe('One corner of the rectangle of cells to read, [x, y] in cells, such as [0, 0]. Give "to" with it. Default: every cell.'),
  to: pair.optional().describe('The opposite corner of the rectangle, included, such as [29, 15].'),
  max_cells: z.number().int().min(1).max(largestMaxCells).default(defaultMaxCells).describe('The most cells to list; the counts cover every cell.'),
  scene: sceneToRead,
});

export function createTileMapGetCellsTool(projectReader: EditorGateway): BridgeTool<typeof tileMapGetCellsInput, TileMapCells> {
  return new BridgeTool(projectReader, {
    name: 'tilemap_get_cells',
    definition: {
      title: 'Read TileMapLayer cells',
      description:
        'Read the cells of a TileMapLayer: its TileSet with the tile size, the physics layers and each source with its texture, tiles and how many of them collide; how many cells use each tile, the rectangle the cells fill and the cells themselves, ordered by y, then x. Use it to check a 2D level of tiles, whole or one rectangle at a time. Works without the editor when "scene" is given.',
      inputSchema: tileMapGetCellsInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'tilemap.get_cells',
    responseSchema: tileMapCellsSchema,
    present: (layer, input) => textResult(describeTileMapCells(layer, input)),
  });
}

function describeTileMapCells(layer: TileMapCells, box: z.infer<typeof tileMapGetCellsInput>): string {
  const severalSources = layer.sources.length > 1;
  const perTile = layer.counts.map((tile) => `${tileName(tile.source, tile.atlas, severalSources)} ×${String(tile.count)}`).join(', ');
  const lines = [describeTileSetOf(layer), ...layer.sources.map(describeTileSource), describeCellTotals(layer, box, perTile)];
  if (layer.count === 0) {
    return lines.join('\n');
  }
  lines.push(
    'Cells, by y, then x:',
    ...layer.cells.map((cell) => `- ${formatCell(cell.position)} ${tileName(cell.source, cell.atlas, severalSources)}${cell.alternative > 0 ? `, alternative ${String(cell.alternative)}` : ''}`),
  );
  if (layer.more) {
    lines.push(describeListedPart(layer.cells.length, layer.count));
  }
  return lines.join('\n');
}

function describeTileSetOf(layer: TileMapCells): string {
  const owner = `${formatNodePath(layer.path)} in ${layer.scene} is a TileMapLayer`;
  if (layer.tile_set === null) {
    return `${owner} without a TileSet.`;
  }
  const tileSet = layer.tile_set === '' ? 'a TileSet of its own,' : layer.tile_set.includes('::') ? 'a TileSet saved in the scene,' : `the TileSet ${layer.tile_set}`;
  const size = layer.tile_size === undefined ? '' : ` of ${String(layer.tile_size[0])}×${String(layer.tile_size[1])} tiles`;
  const physicsLayers = layer.physics_layers ?? 0;
  const physics = physicsLayers === 0 ? 'no physics layer, so nothing collides with its tiles' : plural(physicsLayers, 'physics layer');
  return `${owner} with ${tileSet}${size} and ${physics}.`;
}

function describeTileSource(source: TileSource): string {
  if (source.kind === 'scenes') {
    return `Source ${String(source.id)}: ${plural(source.tiles, 'scene tile')}.`;
  }
  const texture = source.texture === undefined || source.texture === '' ? 'a texture that is not saved in a file' : source.texture;
  const collision = (source.collision_tiles ?? 0) === 0 ? 'none' : String(source.collision_tiles);
  return `Source ${String(source.id)}: ${plural(source.tiles, 'tile')} of ${texture} in ${plural(source.columns ?? 0, 'column')} and ${plural(source.rows ?? 0, 'row')}, ${collision} with collision.`;
}

function tileName(source: number, atlas: readonly number[], severalSources: boolean): string {
  return severalSources ? `tile ${formatCell(atlas)} of source ${String(source)}` : `tile ${formatCell(atlas)}`;
}

const paintedTile = {
  atlas: z
    .union([pair, z.null()])
    .describe('The tile as [column, row] in the atlas of its source, such as [0, 0] for the first one; null erases the cells.'),
  source: z.number().int().min(0).optional().describe('The source of the tile in the TileSet. Default: the only source, when the TileSet has one.'),
  alternative: z.number().int().min(0).optional().describe('An alternative of the tile, such as a flipped copy. Default: 0, the tile itself.'),
};

const tileMapSetCellsInput = z.object({
  path: nodePath.describe('Path of the TileMapLayer node relative to the scene root, such as "Level/Ground".'),
  rects: z
    .array(z.object({ from: pair.describe('One corner, [x, y] in cells.'), to: pair.describe('The opposite corner, included.'), ...paintedTile }))
    .optional()
    .describe('Rectangles of cells to fill with one tile each, in order, so that a later one paints over an earlier one: ground 30 tiles wide is {"from": [0, 10], "to": [29, 10], "atlas": [0, 0]}.'),
  cells: z
    .array(z.object({ position: pair.describe('The cell, [x, y] in cells.'), ...paintedTile }))
    .optional()
    .describe('Single cells to set after the rectangles.'),
  scene: sceneToChange,
});

export function createTileMapSetCellsTool(editor: EditorGateway): BridgeTool<typeof tileMapSetCellsInput, ChangedCells> {
  return new BridgeTool(editor, {
    name: 'tilemap_set_cells',
    definition: {
      title: 'Paint TileMapLayer cells',
      description:
        'Paint tiles of the TileSet of a TileMapLayer on its cells, or erase them, as one Undo step: whole rectangles, such as the ground or a wall, and single cells, each tile given by its [column, row] in the atlas of its source. Cells are whole numbers on the grid, not pixels: cell [x, y] sits at [x, y] times the tile size, and y grows downward. Read the tiles and the cells with tilemap_get_cells first.',
      inputSchema: tileMapSetCellsInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'tilemap.set_cells',
    responseSchema: changedCellsSchema,
    present: (result) => textResult(describeChangedCells(result)),
  });
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
