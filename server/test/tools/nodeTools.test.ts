import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createNodeAddTool, createNodeDeleteTool, createNodeGetPropertiesTool, createNodeSetPropertiesTool } from '../../src/tools/nodeTools.js';
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
});
