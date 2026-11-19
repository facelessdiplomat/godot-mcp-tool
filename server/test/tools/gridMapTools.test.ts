import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createGridMapGetCellsTool, createGridMapSetCellsTool, createMeshLibraryCreateTool } from '../../src/tools/gridMapTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const courtyard = {
  scene: 'res://courtyard.tscn',
  path: 'Courtyard',
  library: 'res://blocks.tres',
  items: [
    { id: 0, name: 'Floor' },
    { id: 1, name: 'Wall' },
  ],
  cell_size: 'Vector3(2, 2, 2)',
};

describe('GridMap tools', () => {
  it('gridmap_get_cells names the blocks, counts the cells of each and lists the cells', async () => {
    const editor = new FakeEditorGateway().respondTo('gridmap.get_cells', {
      ...courtyard,
      count: 3,
      counts: [
        { item: 0, name: 'Floor', count: 2 },
        { item: 1, name: 'Wall', count: 1 },
      ],
      from: [0, 0, 0],
      to: [1, 1, 0],
      cells: [
        { position: [0, 0, 0], item: 0, name: 'Floor', orientation: 0 },
        { position: [1, 0, 0], item: 0, name: 'Floor', orientation: 3 },
        { position: [0, 1, 0], item: 1, name: 'Wall', orientation: 16 },
      ],
      more: false,
    });

    const text = textOf(await createGridMapGetCellsTool(editor).execute({ path: 'Courtyard' }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Courtyard', max_cells: 100 });
    expect(text).toBe(
      [
        'Courtyard in res://courtyard.tscn is a GridMap with the blocks of res://blocks.tres: Floor (0), Wall (1). Its cells measure Vector3(2, 2, 2).',
        'It has 3 cells, from [0, 0, 0] to [1, 1, 0]: Floor 2, Wall 1.',
        'Cells, by y, then z, then x:',
        '- [0, 0, 0] Floor',
        '- [1, 0, 0] Floor, orientation 3',
        '- [0, 1, 0] Wall, turned 90° around y (orientation 16)',
      ].join('\n'),
    );
  });

  it('gridmap_get_cells reads a box of cells and says when more follow', async () => {
    const editor = new FakeEditorGateway().respondTo('gridmap.get_cells', {
      ...courtyard,
      count: 3,
      counts: [{ item: 0, name: 'Floor', count: 3 }],
      from: [1, 0, 0],
      to: [3, 0, 0],
      cells: [
        { position: [1, 0, 0], item: 0, name: 'Floor', orientation: 0 },
        { position: [2, 0, 0], item: 0, name: 'Floor', orientation: 0 },
      ],
      more: true,
    });

    const text = textOf(await createGridMapGetCellsTool(editor).execute({ path: 'Courtyard', from: [1, 0, 0], to: [3, 0, 0], max_cells: 2 }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Courtyard', from: [1, 0, 0], to: [3, 0, 0], max_cells: 2 });
    expect(text).toContain('Between [1, 0, 0] and [3, 0, 0] it has 3 cells: Floor 3.');
    expect(text).toContain('Only the first 2 of 3 cells are listed; read more with a larger max_cells, or a part with from and to.');
  });

  it('gridmap_get_cells says when a GridMap has no cells or no mesh library', async () => {
    const editor = new FakeEditorGateway().respondTo('gridmap.get_cells', {
      ...courtyard,
      library: '',
      items: [],
      count: 0,
      counts: [],
      cells: [],
      more: false,
    });

    const text = textOf(await createGridMapGetCellsTool(editor).execute({ path: 'Courtyard' }));

    expect(text).toBe('Courtyard in res://courtyard.tscn is a GridMap without a mesh library. Its cells measure Vector3(2, 2, 2).\nIt has no cells.');
  });

  it('gridmap_set_cells sends boxes and cells and says what changed', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('gridmap.set_cells', { scene: 'res://courtyard.tscn', path: 'Courtyard', set: 100, erased: 1, unchanged: 2, count: 99 })
      .respondTo('gridmap.set_cells', { scene: 'res://courtyard.tscn', path: 'Courtyard', set: 0, erased: 0, unchanged: 1, count: 99 });
    const boxes: { from: [number, number, number]; to: [number, number, number]; item: string }[] = [
      { from: [-5, 0, -5], to: [4, 0, 4], item: 'Wall' },
      { from: [-4, 0, -4], to: [3, 0, 3], item: 'Floor' },
    ];

    const changed = textOf(await createGridMapSetCellsTool(editor).execute({ path: 'Courtyard', boxes, cells: [{ position: [9, 0, 9], item: null }] }));
    const same = textOf(await createGridMapSetCellsTool(editor).execute({ path: 'Courtyard', cells: [{ position: [0, 0, 0], item: 0, orientation: 16 }] }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Courtyard', boxes, cells: [{ position: [9, 0, 9], item: null }] });
    expect(changed).toBe('Set 100 cells and erased 1 cell of Courtyard in res://courtyard.tscn as one Undo step; 2 cells already were so. It now has 99 cells. The scene has unsaved changes.');
    expect(same).toBe('The 1 cell given already was so in Courtyard in res://courtyard.tscn, so nothing changed. It has 99 cells.');
  });

  it('meshlibrary_create builds a library from a scene of blocks and lists the items with their ids', async () => {
    const editor = new FakeEditorGateway().respondTo('meshlibrary.create', {
      path: 'res://blocks/blocks.tres',
      scene: 'res://blocks/blocks.tscn',
      created: true,
      items: [
        { id: 0, name: 'Grass', mesh: 'BoxMesh', shapes: 1, navigation: false, added: true },
        { id: 1, name: 'Stone', mesh: 'BoxMesh', shapes: 2, navigation: true, added: true },
      ],
      left: [],
      duplicates: [],
      previews: true,
    });

    const text = textOf(await createMeshLibraryCreateTool(editor).execute({ scene: 'res://blocks/blocks.tscn', path: 'res://blocks/blocks.tres' }));

    expect(editor.requests[0]?.params).toEqual({ scene: 'res://blocks/blocks.tscn', path: 'res://blocks/blocks.tres', update: false, apply_transforms: false });
    expect(text).toBe(
      [
        'Created res://blocks/blocks.tres from res://blocks/blocks.tscn with 2 blocks:',
        '- Grass (0): BoxMesh, 1 collision shape',
        '- Stone (1): BoxMesh, 2 collision shapes, a navigation mesh',
        'Give it to a GridMap as its mesh_library and paint the blocks by name with gridmap_set_cells.',
      ].join('\n'),
    );
  });

  it('meshlibrary_create tells which blocks kept their ids on an update, and what it could not do', async () => {
    const editor = new FakeEditorGateway().respondTo('meshlibrary.create', {
      path: 'res://blocks/blocks.tres',
      scene: 'res://blocks/blocks.tscn',
      created: false,
      items: [
        { id: 2, name: 'Lava', mesh: 'ArrayMesh', shapes: 0, navigation: false, added: true },
        { id: 1, name: 'Stone', mesh: 'BoxMesh', shapes: 1, navigation: false, added: false },
      ],
      left: [{ id: 0, name: 'Grass' }],
      duplicates: ['Stone'],
      previews: false,
    });

    const text = textOf(await createMeshLibraryCreateTool(editor).execute({ scene: 'res://blocks/blocks.tscn', path: 'res://blocks/blocks.tres', update: true }));

    expect(text).toContain('Updated res://blocks/blocks.tres from res://blocks/blocks.tscn: 1 new block, 1 kept its id.');
    expect(text).toContain('- Lava (2, new): ArrayMesh, no collision shape');
    expect(text).toContain('- Stone (1): BoxMesh, 1 collision shape');
    expect(text).toContain('Still in the library, though the scene has no block of that name: Grass (0).');
    expect(text).toContain('Several MeshInstance3D nodes are named Stone; the last one became the block.');
    expect(text).toContain('No previews: the editor runs without a window, so the GridMap palette shows the names of the blocks.');
  });
});
