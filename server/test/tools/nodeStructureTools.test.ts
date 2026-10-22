import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createNodeDuplicateTool, createNodeReparentTool } from '../../src/tools/nodeStructureTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('node structure tools', () => {
  it('node_reparent reports the move and the node paths it updated', async () => {
    const editor = new FakeEditorGateway().respondTo('node.reparent', {
      scene: 'res://levels/arena.tscn',
      path: 'Player/Crate',
      previous_path: 'Crate',
      type: 'Node3D',
      updated_references: [{ node: 'Follower', property: 'remote_path', path: '../Player/Crate' }],
    });

    const result = await createNodeReparentTool(editor).execute({ path: 'Crate', parent: 'Player' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Crate', parent: 'Player', keep_global_transform: true });
    expect(textOf(result)).toBe(
      [
        'Moved Crate to Player/Crate in res://levels/arena.tscn. The scene has unsaved changes.',
        'Updated node paths that pointed at the moved nodes:',
        '- Follower.remote_path = "../Player/Crate"',
      ].join('\n'),
    );
  });

  it('node_reparent describes a rename and a new place among the siblings', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('node.reparent', { scene: 'res://levels/arena.tscn', path: 'Box', previous_path: 'Crate', type: 'Node3D', updated_references: [] })
      .respondTo('node.reparent', { scene: 'res://levels/arena.tscn', path: 'Box', previous_path: 'Box', type: 'Node3D', updated_references: [] });

    const renamed = textOf(await createNodeReparentTool(editor).execute({ path: 'Crate', name: 'Box' }));
    const reordered = textOf(await createNodeReparentTool(editor).execute({ path: 'Box', index: 0 }));

    expect(renamed).toBe('Renamed Crate to Box in res://levels/arena.tscn. The scene has unsaved changes.');
    expect(reordered).toBe('Moved Box to position 0 among its siblings in res://levels/arena.tscn. The scene has unsaved changes.');
  });

  it('node_duplicate reports the copy and its properties', async () => {
    const editor = new FakeEditorGateway().respondTo('node.duplicate', {
      scene: 'res://levels/arena.tscn',
      path: 'Props/CrateB',
      source: 'Crate',
      type: 'Node3D',
      applied: ['position'],
      rejected: [],
      not_applied: [],
    });

    const result = await createNodeDuplicateTool(editor).execute({ path: 'Crate', name: 'CrateB', parent: 'Props', properties: { position: [3, 0, 0] } });

    expect(textOf(result)).toBe(
      'Duplicated Crate as Props/CrateB (Node3D) in res://levels/arena.tscn. The scene has unsaved changes.\nApplied: position',
    );
  });
});
