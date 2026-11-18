import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createTileMapGetCellsTool, createTileMapSetCellsTool, createTileSetAddAtlasTool } from '../../src/tools/tileTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const groundSource = { id: 0, kind: 'atlas', texture: 'res://tiles.png', columns: 3, rows: 1, tiles: 2, collision_tiles: 2 };

describe('tile tools', () => {
  it('tileset_add_atlas builds a TileSet from a texture and says how to paint with it', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('tileset.add_atlas', {
        path: 'res://ground.tres',
        created: true,
        source_id: 0,
        texture: 'res://tiles.png',
        tile_size: [32, 32],
        columns: 3,
        rows: 1,
        tiles: 2,
        skipped: 1,
        collision: 2,
      })
      .respondTo('tileset.add_atlas', {
        path: 'res://ground.tres',
        created: false,
        source_id: 1,
        texture: 'res://props.png',
        tile_size: [16, 16],
        columns: 2,
        rows: 2,
        tiles: 4,
        skipped: 0,
        collision: 0,
      });

    const created = textOf(await createTileSetAddAtlasTool(editor).execute({ path: 'res://ground.tres', texture: 'res://tiles.png', tile_size: [32, 32], collision: true }));
    const added = textOf(await createTileSetAddAtlasTool(editor).execute({ path: 'res://ground.tres', texture: 'res://props.png', tile_size: [16, 16] }));

    expect(editor.requests[0]?.params).toEqual({ path: 'res://ground.tres', texture: 'res://tiles.png', tile_size: [32, 32], collision: true });
    expect(created).toBe(
      [
        'Created res://ground.tres, a TileSet of 32×32 tiles, with source 0: 2 tiles of res://tiles.png in 3 columns and 1 row, leaving out 1 empty cell. Each tile collides as a full square on physics layer 0.',
        'Give it to a TileMapLayer with node_set_properties, such as {"tile_set": "res://ground.tres"}, and paint with tilemap_set_cells, such as {"atlas": [0, 0], "source": 0}.',
      ].join('\n'),
    );
    expect(added.split('\n')[0]).toBe('Added source 1 to res://ground.tres: 4 tiles of res://props.png, 16×16 each, in 2 columns and 2 rows. The tiles have no collision.');
  });

  it('tilemap_get_cells describes the TileSet, counts the tiles and lists the cells', async () => {
    const editor = new FakeEditorGateway().respondTo('tilemap.get_cells', {
      scene: 'res://level.tscn',
      path: 'Ground',
      tile_set: 'res://ground.tres',
      tile_size: [32, 32],
      physics_layers: 1,
      sources: [groundSource],
      count: 3,
      counts: [
        { source: 0, atlas: [0, 0], count: 2 },
        { source: 0, atlas: [1, 0], count: 1 },
      ],
      from: [0, 4],
      to: [1, 5],
      cells: [
        { position: [1, 4], source: 0, atlas: [1, 0], alternative: 0 },
        { position: [0, 5], source: 0, atlas: [0, 0], alternative: 0 },
        { position: [1, 5], source: 0, atlas: [0, 0], alternative: 2 },
      ],
      more: false,
    });

    const text = textOf(await createTileMapGetCellsTool(editor).execute({ path: 'Ground' }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Ground', max_cells: 100 });
    expect(text).toBe(
      [
        'Ground in res://level.tscn is a TileMapLayer with the TileSet res://ground.tres of 32×32 tiles and 1 physics layer.',
        'Source 0: 2 tiles of res://tiles.png in 3 columns and 1 row, 2 with collision.',
        'It has 3 cells, from [0, 4] to [1, 5]: tile [0, 0] ×2, tile [1, 0] ×1.',
        'Cells, by y, then x:',
        '- [1, 4] tile [1, 0]',
        '- [0, 5] tile [0, 0]',
        '- [1, 5] tile [0, 0], alternative 2',
      ].join('\n'),
    );
  });

  it('tilemap_get_cells names the source of each tile when there are several, and says what is missing', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('tilemap.get_cells', {
        scene: 'res://level.tscn',
        path: 'Ground',
        tile_set: 'res://level.tscn::TileSet_abc',
        tile_size: [16, 16],
        physics_layers: 0,
        sources: [
          { ...groundSource, collision_tiles: 0 },
          { id: 3, kind: 'scenes', tiles: 1 },
        ],
        count: 5,
        counts: [
          { source: 0, atlas: [0, 0], count: 4 },
          { source: 3, atlas: [0, 0], count: 1 },
        ],
        from: [0, 0],
        to: [1, 0],
        cells: [
          { position: [0, 0], source: 0, atlas: [0, 0], alternative: 0 },
          { position: [1, 0], source: 3, atlas: [0, 0], alternative: 1 },
        ],
        more: true,
      })
      .respondTo('tilemap.get_cells', { scene: 'res://level.tscn', path: 'Ground', tile_set: null, sources: [], count: 0, counts: [], cells: [], more: false });

    const several = textOf(await createTileMapGetCellsTool(editor).execute({ path: 'Ground', from: [0, 0], to: [9, 0], max_cells: 2 }));
    const bare = textOf(await createTileMapGetCellsTool(editor).execute({ path: 'Ground' }));

    expect(several).toContain('with a TileSet saved in the scene, of 16×16 tiles and no physics layer, so nothing collides with its tiles.');
    expect(several).toContain('Source 0: 2 tiles of res://tiles.png in 3 columns and 1 row, none with collision.\nSource 3: 1 scene tile.');
    expect(several).toContain('Between [0, 0] and [9, 0] it has 5 cells: tile [0, 0] of source 0 ×4, tile [0, 0] of source 3 ×1.');
    expect(several).toContain('- [1, 0] tile [0, 0] of source 3, alternative 1');
    expect(several).toContain('Only the first 2 of 5 cells are listed; read more with a larger max_cells, or a part with from and to.');
    expect(bare).toBe('Ground in res://level.tscn is a TileMapLayer without a TileSet.\nIt has no cells.');
  });

  it('tilemap_set_cells sends rects and cells and says what changed', async () => {
    const editor = new FakeEditorGateway().respondTo('tilemap.set_cells', { scene: 'res://level.tscn', path: 'Ground', set: 30, erased: 0, unchanged: 0, count: 30 });
    const rects: { from: [number, number]; to: [number, number]; atlas: [number, number] }[] = [{ from: [0, 10], to: [29, 10], atlas: [0, 0] }];

    const text = textOf(await createTileMapSetCellsTool(editor).execute({ path: 'Ground', rects }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Ground', rects });
    expect(text).toBe('Set 30 cells of Ground in res://level.tscn as one Undo step. It now has 30 cells. The scene has unsaved changes.');
  });
});
