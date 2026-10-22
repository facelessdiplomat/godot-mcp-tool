import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { createSceneBatchEditTool } from '../../src/tools/batchTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const emptyReport = { applied: [], rejected: [], not_applied: [] };

describe('scene_batch_edit', () => {
  it('forwards the operations and summarizes each result', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.batch_edit', {
      scene: 'res://levels/arena.tscn',
      results: [
        { op: 'node_add', path: 'Player', type: 'CharacterBody3D', ...emptyReport },
        { op: 'node_add', path: 'Player/Camera', type: 'Camera3D', ...emptyReport, applied: ['position'] },
        { op: 'node_set_properties', path: 'Player', ...emptyReport, applied: ['position', 'rotation_degrees'] },
        { op: 'node_reparent', path: 'Player/View', previous_path: 'Player/Camera', type: 'Camera3D', updated_references: [] },
        { op: 'node_duplicate', path: 'Crate2', source: 'Crate', type: 'Node3D', ...emptyReport },
        { op: 'node_delete', deleted: ['Old'] },
        { op: 'signal_connect', from: 'Start', signal: 'pressed', to: '.', method: '_on_start_pressed', flags: [], binds: [], already_connected: false },
        { op: 'signal_disconnect', from: 'Quit', signal: 'pressed', to: '.', method: '_on_quit_pressed' },
      ],
    });

    const result = await createSceneBatchEditTool(editor).execute({
      operations: [
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player' },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', parent: 'Player', properties: { position: [0, 2, 4] } },
        { op: 'node_set_properties', path: 'Player', properties: { position: [1, 0, 0], rotation_degrees: [0, 90, 0] } },
        { op: 'node_reparent', path: 'Player/Camera', name: 'View' },
        { op: 'node_duplicate', path: 'Crate' },
        { op: 'node_delete', paths: ['Old'] },
        { op: 'signal_connect', from: 'Start', signal: 'pressed', method: '_on_start_pressed' },
        { op: 'signal_disconnect', from: 'Quit', signal: 'pressed', method: '_on_quit_pressed' },
      ],
    });

    expect(editor.requests[0]?.params['operations']).toContainEqual({ op: 'node_add', type: 'CharacterBody3D', name: 'Player', parent: '.' });
    expect(textOf(result)).toBe(
      [
        'Applied 8 operations to res://levels/arena.tscn as one Undo step. The scene has unsaved changes.',
        '1. Added Player (CharacterBody3D)',
        '2. Added Player/Camera (Camera3D); set position',
        '3. Set position, rotation_degrees of Player',
        '4. Renamed Player/Camera to Player/View',
        '5. Duplicated Crate as Crate2',
        '6. Deleted Old',
        '7. Connected Start.pressed to _on_start_pressed() on the scene root',
        '8. Disconnected Quit.pressed from _on_quit_pressed() on the scene root',
      ].join('\n'),
    );
  });

  it('rejects an operation with a scene of its own before asking the editor', async () => {
    const editor = new FakeEditorGateway();

    const result = await createSceneBatchEditTool(editor).execute({
      operations: [{ op: 'node_add', type: 'Node3D', scene: 'res://other.tscn' }],
    } as never);

    expect(result.isError).toBe(true);
    expect(editor.requests).toHaveLength(0);
  });

  it('passes on the failed operation that undid the batch', async () => {
    const editor = new FakeEditorGateway().respondTo(
      'scene.batch_edit',
      new BridgeRequestError('Operation 3 (node_set_properties): Node "Ghost" not found. Nothing was changed.', -32004, 'Similar: Goblin.', undefined),
    );

    const result = await createSceneBatchEditTool(editor).execute({ operations: [{ op: 'node_set_properties', path: 'Ghost', properties: { visible: false } }] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Operation 3 (node_set_properties): Node "Ghost" not found. Nothing was changed.\nHint: Similar: Goblin.');
  });
});
