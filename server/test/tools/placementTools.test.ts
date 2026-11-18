import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createNodeAddCollisionTool, createNodeSnapToFloorTool, createSceneRaycastTool } from '../../src/tools/placementTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('placement tools', () => {
  it('scene_raycast says what a ray hits and how', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('scene.raycast', {
        scene: 'res://arena.tscn',
        from: 'Vector3(6, 10, 0)',
        to: 'Vector3(6, -990, 0)',
        hit: true,
        position: 'Vector3(6, 2, 0)',
        normal: 'Vector3(0, 1, 0)',
        distance: 8,
        node: 'Hill',
        type: 'MeshInstance3D',
        by: 'mesh',
      })
      .respondTo('scene.raycast', { scene: 'res://arena.tscn', from: 'Vector3(50, 10, 50)', to: 'Vector3(50, -990, 50)', hit: false });

    const hit = textOf(await createSceneRaycastTool(editor).execute({ from: [6, 10, 0] }));
    const miss = textOf(await createSceneRaycastTool(editor).execute({ from: [50, 10, 50] }));

    expect(editor.requests[0]?.params).toEqual({ from: [6, 10, 0], in_game: false });
    expect(hit).toBe('The ray from Vector3(6, 10, 0) hits Hill (MeshInstance3D) at Vector3(6, 2, 0), 8 m away, with the normal Vector3(0, 1, 0). It hit the visible mesh, which has no collision shape there.');
    expect(miss).toBe('The ray from Vector3(50, 10, 50) to Vector3(50, -990, 50) in res://arena.tscn hits nothing.');
  });

  it('node_snap_to_floor reports where each node came to rest', async () => {
    const editor = new FakeEditorGateway().respondTo('node.snap_to_floor', {
      scene: 'res://arena.tscn',
      nodes: [
        { path: 'Crate', moved: true, rise: -4.5, on: 'Floor', by: 'collision', position: 'Vector3(0, 0.5, 0)' },
        { path: 'Lost', moved: false, reason: 'there is nothing below it within 500 m' },
      ],
      editable_children: [],
    });

    const text = textOf(await createNodeSnapToFloorTool(editor).execute({ paths: ['Crate', 'Lost'] }));

    expect(editor.requests[0]?.params).toEqual({ paths: ['Crate', 'Lost'] });
    expect(text).toBe(
      [
        'Placed nodes on what is below them in res://arena.tscn, as one Undo step. The scene has unsaved changes.',
        'Crate moved down 4.5 m and rests on Floor, now at Vector3(0, 0.5, 0).',
        'Lost stays where it is: there is nothing below it within 500 m.',
      ].join('\n'),
    );
  });

  it('node_snap_to_floor tilts nodes to the surface when asked to align them', async () => {
    const editor = new FakeEditorGateway().respondTo('node.snap_to_floor', {
      scene: 'res://arena.tscn',
      nodes: [{ path: 'Crate', moved: true, rise: -5.5, on: 'Hill', by: 'collision', position: 'Vector3(1.5, 2.5, -5)', tilt: 36.87, rotation: 'Vector3(0, 0, -36.87)' }],
      editable_children: [],
    });

    const text = textOf(await createNodeSnapToFloorTool(editor).execute({ paths: ['Crate'], align: true }));

    expect(editor.requests[0]?.params).toEqual({ paths: ['Crate'], align: true });
    expect(text).toContain('Crate tilted 36.87° to the surface below it, moved down 5.5 m and rests on Hill, now at Vector3(1.5, 2.5, -5) with rotation_degrees Vector3(0, 0, -36.87).');
  });

  it('node_add_collision names the shapes and compares their size with the mesh', async () => {
    const editor = new FakeEditorGateway().respondTo('node.add_collision', {
      scene: 'res://arena.tscn',
      path: 'Rock',
      shapes: [{ path: 'Rock/StaticBody3D/CollisionShape3D', type: 'ConcavePolygonShape3D' }],
      mesh_size: 'Vector3(2, 1.5, 2)',
      collision_size: 'Vector3(2, 1.5, 2)',
      editable_children: [],
    });

    const text = textOf(await createNodeAddCollisionTool(editor).execute({ path: 'Rock', shape: 'trimesh' }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Rock', shape: 'trimesh', placement: 'static_body' });
    expect(text).toBe(
      [
        'Added a trimesh collision to Rock in res://arena.tscn as one Undo step: Rock/StaticBody3D/CollisionShape3D (ConcavePolygonShape3D). The scene has unsaved changes.',
        'The collision measures Vector3(2, 1.5, 2); the mesh measures Vector3(2, 1.5, 2).',
      ].join('\n'),
    );
  });
});
