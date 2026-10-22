import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import {
  createNodeAddTool,
  createNodeDeleteTool,
  createNodeFindTool,
  createNodeGetBoundsTool,
  createNodeGetPropertiesTool,
  createNodeSetPropertiesTool,
} from '../../src/tools/nodeTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const emptyReport = { applied: [], rejected: [], not_applied: [] };

describe('node tools', () => {
  it('node_add forwards the node description and reports the result', async () => {
    const editor = new FakeEditorGateway().respondTo('node.add', {
      scene: 'res://levels/arena.tscn',
      path: 'Crate',
      type: 'MeshInstance3D',
      applied: ['position', 'mesh'],
      rejected: [],
      not_applied: [],
    });

    const result = await createNodeAddTool(editor).execute({
      type: 'MeshInstance3D',
      name: 'Crate',
      properties: { position: [0, 0.5, 0], mesh: { new: 'BoxMesh' } },
    });

    expect(editor.requests[0]?.params).toEqual({
      type: 'MeshInstance3D',
      name: 'Crate',
      parent: '.',
      properties: { position: [0, 0.5, 0], mesh: { new: 'BoxMesh' } },
    });
    expect(textOf(result)).toBe('Added Crate (MeshInstance3D) to res://levels/arena.tscn. The scene has unsaved changes.\nApplied: position, mesh');
  });

  it('node_delete lists the deleted nodes', async () => {
    const editor = new FakeEditorGateway().respondTo('node.delete', { scene: 'res://levels/arena.tscn', deleted: ['Player', 'Enemy'] });

    const result = await createNodeDeleteTool(editor).execute({ paths: ['Player', 'Enemy'] });

    expect(textOf(result)).toBe('Deleted Player, Enemy from res://levels/arena.tscn. The scene has unsaved changes; Ctrl+Z in the editor brings them back.');
    expect(createNodeDeleteTool(editor).definition.annotations.destructiveHint).toBe(true);
  });

  it('node_get_properties lists the properties', async () => {
    const editor = new FakeEditorGateway().respondTo('node.get_properties', {
      scene: 'res://levels/arena.tscn',
      path: 'Player',
      type: 'CharacterBody3D',
      properties: [{ name: 'position', type: 'Vector3', value: 'Vector3(1, 2, 3)' }],
    });

    const result = await createNodeGetPropertiesTool(editor).execute({ path: 'Player' });

    expect(textOf(result)).toBe('Player (CharacterBody3D) in res://levels/arena.tscn\nposition = Vector3(1, 2, 3)  [Vector3]');
  });

  it('node_set_properties reports a partial success as a success', async () => {
    const editor = new FakeEditorGateway().respondTo('node.set_properties', {
      scene: 'res://levels/arena.tscn',
      path: 'Player',
      applied: ['position'],
      rejected: [{ name: 'speed', reason: 'CharacterBody3D has no property "speed".' }],
      not_applied: [],
    });

    const result = await createNodeSetPropertiesTool(editor).execute({ path: 'Player', properties: { position: [1, 2, 3], speed: 5 } });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('Updated Player in res://levels/arena.tscn.');
    expect(textOf(result)).toContain('- speed: CharacterBody3D has no property "speed".');
  });

  it('node_set_properties reports a full failure as an error', async () => {
    const editor = new FakeEditorGateway().respondTo('node.set_properties', {
      scene: 'res://levels/arena.tscn',
      path: 'Player',
      ...emptyReport,
      rejected: [{ name: 'speed', reason: 'CharacterBody3D has no property "speed".' }],
    });

    const result = await createNodeSetPropertiesTool(editor).execute({ path: 'Player', properties: { speed: 5 } });

    expect(result.isError).toBe(true);
  });

  it('node_get_bounds describes the box a node takes up in the world', async () => {
    const editor = new FakeEditorGateway().respondTo('node.get_bounds', {
      scene: 'res://levels/arena.tscn',
      path: 'Crate',
      type: 'Node3D',
      position: 'Vector3(3, 0, -1)',
      size: 'Vector3(2, 2, 2)',
      center: 'Vector3(4, 1, 0)',
      end: 'Vector3(5, 2, 1)',
      visual_count: 1,
      collision_count: 1,
    });

    const result = await createNodeGetBoundsTool(editor).execute({ path: 'Crate' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Crate', in_game: false });
    expect(textOf(result)).toBe(
      [
        'Crate (Node3D) in res://levels/arena.tscn, in world coordinates:',
        'center Vector3(4, 1, 0), size Vector3(2, 2, 2)',
        'from Vector3(3, 0, -1) to Vector3(5, 2, 1)',
        'Measured from 1 visual node.',
      ].join('\n'),
    );
  });

  it('node_get_bounds measures a node of the running game by its collision shapes', async () => {
    const editor = new FakeEditorGateway().respondTo('node.get_bounds', {
      scene: 'res://levels/arena.tscn',
      path: 'Player',
      type: 'CharacterBody3D',
      position: 'Vector3(-0.5, 0, -0.5)',
      size: 'Vector3(1, 2, 1)',
      center: 'Vector3(0, 1, 0)',
      end: 'Vector3(0.5, 2, 0.5)',
      visual_count: 0,
      collision_count: 2,
    });

    const result = await createNodeGetBoundsTool(editor).execute({ path: 'Player', in_game: true });

    expect(textOf(result)).toContain('Player (CharacterBody3D) in the running game (res://levels/arena.tscn), in world coordinates:');
    expect(textOf(result)).toContain('No visual nodes, so measured from 2 collision shapes.');
  });

  it('node_get_bounds says when a node has nothing to measure', async () => {
    const editor = new FakeEditorGateway().respondTo('node.get_bounds', {
      scene: 'res://levels/arena.tscn',
      path: '.',
      type: 'Node3D',
      position: 'Vector3(0, 0, 0)',
      size: 'Vector3(0, 0, 0)',
      center: 'Vector3(0, 0, 0)',
      end: 'Vector3(0, 0, 0)',
      visual_count: 0,
      collision_count: 0,
    });

    const result = await createNodeGetBoundsTool(editor).execute({ path: '.' });

    expect(textOf(result)).toContain('The scene root (Node3D)');
    expect(textOf(result)).toContain('There are no visual nodes or collision shapes below it, so this is only its position.');
  });

  it('node_find lists the matching nodes with their paths', async () => {
    const editor = new FakeEditorGateway().respondTo('node.find', {
      scene: 'res://levels/arena.tscn',
      matches: [
        { path: 'Enemies/Goblin', type: 'CharacterBody3D', script: 'res://enemies/goblin.gd', groups: ['enemies'] },
        { path: 'Crate', type: 'Node3D', instance: 'res://props/crate.tscn' },
      ],
      total: 2,
      truncated: false,
    });

    const result = await createNodeFindTool(editor).execute({ group: 'enemies' });

    expect(editor.requests[0]?.params).toEqual({ group: 'enemies', max_results: 50 });
    expect(textOf(result)).toBe(
      [
        '2 nodes in res://levels/arena.tscn match:',
        'Enemies/Goblin: CharacterBody3D [script res://enemies/goblin.gd] groups=enemies',
        'Crate: Node3D [instance res://props/crate.tscn]',
      ].join('\n'),
    );
  });

  it('node_find says what it looked for when nothing matches', async () => {
    const editor = new FakeEditorGateway().respondTo('node.find', { scene: 'res://levels/arena.tscn', matches: [], total: 0, truncated: false });

    const result = await createNodeFindTool(editor).execute({ name: 'orc', type: 'CharacterBody3D' });

    expect(textOf(result)).toBe('No node in res://levels/arena.tscn matches name "orc" and type CharacterBody3D.');
  });

  it('node_find tells how to see more matches', async () => {
    const editor = new FakeEditorGateway().respondTo('node.find', {
      scene: 'res://levels/arena.tscn',
      matches: [{ path: 'Tree1', type: 'Node3D' }],
      total: 40,
      truncated: true,
    });

    const result = await createNodeFindTool(editor).execute({ name: 'Tree*', max_results: 1 });

    expect(textOf(result)).toContain('Showing the first 1 of 40; narrow the search or raise max_results.');
  });
});
