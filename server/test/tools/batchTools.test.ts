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

  it('says which operations turned on editable children of an instance', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.batch_edit', {
      scene: 'res://levels/arena.tscn',
      results: [
        { op: 'node_set_properties', path: 'Enemy2/Mesh', ...emptyReport, applied: ['visible'], editable_children: ['Enemy2'] },
        { op: 'node_set_groups', path: 'Enemy2/Mesh', groups: ['targets'], added: ['targets'], removed: [], unchanged: [], editable_children: [] },
        { op: 'node_add', path: 'Enemy2/Mesh/Marker', type: 'Marker3D', ...emptyReport, editable_children: [] },
        { op: 'signal_connect', from: 'Enemy3/Hitbox', signal: 'body_entered', to: '.', method: '_on_hit', flags: [], binds: [], already_connected: false, editable_children: ['Enemy3'] },
      ],
    });

    const result = await createSceneBatchEditTool(editor).execute({
      operations: [
        { op: 'node_set_properties', path: 'Enemy2/Mesh', properties: { visible: false } },
        { op: 'node_set_groups', path: 'Enemy2/Mesh', add: ['targets'] },
        { op: 'node_add', type: 'Marker3D', name: 'Marker', parent: 'Enemy2/Mesh' },
        { op: 'signal_connect', from: 'Enemy3/Hitbox', signal: 'body_entered', method: '_on_hit' },
      ],
    });

    expect(textOf(result)).toBe(
      [
        'Applied 4 operations to res://levels/arena.tscn as one Undo step. The scene has unsaved changes.',
        '1. Set visible of Enemy2/Mesh; turned on Editable Children of Enemy2',
        '2. Set the groups of Enemy2/Mesh, now: targets',
        '3. Added Enemy2/Mesh/Marker (Marker3D)',
        '4. Connected Enemy3/Hitbox.body_entered to _on_hit() on the scene root; turned on Editable Children of Enemy3',
        'Editable Children keeps changes inside instanced scenes saved with this scene.',
      ].join('\n'),
    );
  });

  it('summarizes saving a branch as a scene and making an instance local', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.batch_edit', {
      scene: 'res://levels/arena.tscn',
      results: [
        { op: 'node_save_as_scene', path: 'Enemy', file: 'res://enemies/enemy.tscn', type: 'CharacterBody3D', node_count: 4 },
        { op: 'node_make_local', path: 'Crate', scene_file: 'res://props/crate.tscn', taken_over: 1 },
      ],
    });

    const result = await createSceneBatchEditTool(editor).execute({
      operations: [
        { op: 'node_save_as_scene', path: 'Enemy', file: 'res://enemies/enemy.tscn' },
        { op: 'node_make_local', path: 'Crate' },
      ],
    });

    expect(textOf(result)).toBe(
      [
        'Applied 2 operations to res://levels/arena.tscn as one Undo step. The scene has unsaved changes.',
        '1. Saved Enemy as res://enemies/enemy.tscn and put an instance of it in its place',
        '2. Made Crate local, taking over 1 node from res://props/crate.tscn',
      ].join('\n'),
    );
  });

  it('summarizes collisions added from meshes', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.batch_edit', {
      scene: 'res://levels/arena.tscn',
      results: [
        {
          op: 'node_add_collision',
          path: 'Rock',
          shapes: [{ path: 'Rock/StaticBody3D/CollisionShape3D', type: 'ConvexPolygonShape3D' }],
          mesh_size: 'Vector3(2, 1, 2)',
          collision_size: 'Vector3(2, 1, 2)',
          editable_children: [],
        },
        {
          op: 'node_add_collision',
          path: 'Crate2/Mesh',
          shapes: [
            { path: 'Crate2/Mesh/StaticBody3D/CollisionShape3D', type: 'ConvexPolygonShape3D' },
            { path: 'Crate2/Mesh/StaticBody3D/CollisionShape3D2', type: 'ConvexPolygonShape3D' },
          ],
          mesh_size: 'Vector3(1, 1, 1)',
          collision_size: 'Vector3(1, 1, 1)',
          editable_children: ['Crate2'],
        },
      ],
    });

    const result = await createSceneBatchEditTool(editor).execute({
      operations: [
        { op: 'node_add_collision', path: 'Rock', shape: 'convex' },
        { op: 'node_add_collision', path: 'Crate2/Mesh', shape: 'multiple_convex' },
      ],
    });

    expect(textOf(result)).toBe(
      [
        'Applied 2 operations to res://levels/arena.tscn as one Undo step. The scene has unsaved changes.',
        '1. Gave Rock a collision of 1 shape',
        '2. Gave Crate2/Mesh a collision of 2 shapes; turned on Editable Children of Crate2',
        'Editable Children keeps changes inside instanced scenes saved with this scene.',
      ].join('\n'),
    );
  });

  it('says which values the engine adjusted', async () => {
    const adjustedSize = { name: 'size', expected: 'Vector2(240, 24)', actual: 'Vector2(240, 27)' };
    const editor = new FakeEditorGateway().respondTo('scene.batch_edit', {
      scene: 'res://ui/hud.tscn',
      results: [
        { op: 'node_add', path: 'Health', type: 'ProgressBar', ...emptyReport, applied: ['size'], not_applied: [adjustedSize] },
        { op: 'node_set_properties', path: 'Health', ...emptyReport, applied: ['size'], not_applied: [adjustedSize] },
      ],
    });

    const result = await createSceneBatchEditTool(editor).execute({
      operations: [
        { op: 'node_add', type: 'ProgressBar', name: 'Health', properties: { size: [240, 24] } },
        { op: 'node_set_properties', path: 'Health', properties: { size: [240, 24] } },
      ],
    });

    expect(textOf(result)).toBe(
      [
        'Applied 2 operations to res://ui/hud.tscn as one Undo step. The scene has unsaved changes.',
        '1. Added Health (ProgressBar); set size; the engine kept size at "Vector2(240, 27)" instead of "Vector2(240, 24)"',
        '2. Set size of Health; the engine kept size at "Vector2(240, 27)" instead of "Vector2(240, 24)"',
      ].join('\n'),
    );
  });

  it('summarizes group changes', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.batch_edit', {
      scene: 'res://levels/arena.tscn',
      results: [{ op: 'node_set_groups', path: 'Coin', groups: ['pickups'], added: ['pickups'], removed: [], unchanged: [] }],
    });

    const result = await createSceneBatchEditTool(editor).execute({ operations: [{ op: 'node_set_groups', path: 'Coin', add: ['pickups'] }] });

    expect(textOf(result)).toBe('Applied 1 operation to res://levels/arena.tscn as one Undo step. The scene has unsaved changes.\n1. Set the groups of Coin, now: pickups');
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
