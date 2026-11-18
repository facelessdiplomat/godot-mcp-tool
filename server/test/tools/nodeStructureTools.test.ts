import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createNodeDuplicateTool, createNodeMakeLocalTool, createNodeReparentTool, createNodeSaveAsSceneTool } from '../../src/tools/nodeStructureTools.js';
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

  it('node_save_as_scene reports the new scene file and the instance that took the place of the branch', async () => {
    const editor = new FakeEditorGateway().respondTo('node.save_as_scene', {
      scene: 'res://levels/arena.tscn',
      path: 'Enemy',
      file: 'res://enemies/enemy.tscn',
      type: 'CharacterBody3D',
      node_count: 4,
    });

    const result = await createNodeSaveAsSceneTool(editor).execute({ path: 'Enemy', file: 'res://enemies/enemy.tscn' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Enemy', file: 'res://enemies/enemy.tscn' });
    expect(textOf(result)).toBe(
      [
        'Saved Enemy and its 3 child nodes as res://enemies/enemy.tscn, and put an instance of it in their place in res://levels/arena.tscn.',
        'The new file is saved; res://levels/arena.tscn has unsaved changes, and Ctrl+Z in the editor puts the nodes back.',
      ].join('\n'),
    );
  });

  it('node_make_local reports how many nodes became part of the scene', async () => {
    const editor = new FakeEditorGateway().respondTo('node.make_local', { scene: 'res://levels/arena.tscn', path: 'Enemy2', scene_file: 'res://enemies/enemy.tscn', taken_over: 3 });

    const result = await createNodeMakeLocalTool(editor).execute({ path: 'Enemy2' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Enemy2' });
    expect(textOf(result)).toBe(
      'Made Enemy2 local in res://levels/arena.tscn: it and its 3 nodes from res://enemies/enemy.tscn now belong to this scene and no longer follow changes to that file. The scene has unsaved changes.',
    );
  });
});
