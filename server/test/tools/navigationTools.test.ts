import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createNavigationBakeTool, createNavigationGetPathTool } from '../../src/tools/navigationTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function bakedRegion(path: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path,
    polygons: 12,
    vertices: 30,
    agent_radius: 0.5,
    agent_height: 1.5,
    warnings: [],
    from: 'Vector3(-9.5, 0.5, -9.5)',
    to: 'Vector3(9.5, 0.5, 9.5)',
    ...overrides,
  };
}

describe('navigation tools', () => {
  it('navigation_bake reports the polygons and the area of each baked region', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.bake', {
      scene: 'res://arena.tscn',
      regions: [bakedRegion('North'), bakedRegion('South', { polygons: 4, from: 'Vector3(-5, 0.5, 10.5)', to: 'Vector3(5, 0.5, 20)' })],
      skipped: [],
    });

    const result = await createNavigationBakeTool(editor).execute({});

    expect(editor.requests[0]?.params).toEqual({});
    expect(editor.requests[0]?.options?.timeoutMs).toBe(120_000);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Baked the navigation meshes of North, South in res://arena.tscn as one Undo step; the scene has unsaved changes.',
        '- North: 12 polygons from Vector3(-9.5, 0.5, -9.5) to Vector3(9.5, 0.5, 9.5), for an agent of radius 0.5 and height 1.5',
        '- South: 4 polygons from Vector3(-5, 0.5, 10.5) to Vector3(5, 0.5, 20), for an agent of radius 0.5 and height 1.5',
      ].join('\n'),
    );
  });

  it('navigation_bake passes the region and the scene on', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.bake', { scene: 'res://arena.tscn', regions: [bakedRegion('Navigation')], skipped: [] });

    const result = await createNavigationBakeTool(editor).execute({ path: 'Navigation', scene: 'res://arena.tscn' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Navigation', scene: 'res://arena.tscn' });
    expect(textOf(result)).toMatch(/^Baked the navigation mesh of Navigation in res:\/\/arena\.tscn as one Undo step/);
  });

  it('navigation_bake fails with the reasons when no region got polygons', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.bake', {
      scene: 'res://arena.tscn',
      regions: [
        {
          path: 'Navigation',
          polygons: 0,
          vertices: 0,
          agent_radius: 15,
          agent_height: 1.5,
          warnings: ['cell_size 0.1 is smaller than the project\'s navigation/3d/default_cell_size 0.25'],
          reason: 'it found no geometry under Navigation',
        },
      ],
      skipped: [{ path: 'Empty', reason: 'it has no NavigationMesh' }],
    });

    const result = await createNavigationBakeTool(editor).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      [
        'No navigation mesh in res://arena.tscn got any polygons.',
        '- Navigation: no polygons: it found no geometry under Navigation',
        "  Warning: cell_size 0.1 is smaller than the project's navigation/3d/default_cell_size 0.25",
        'Not baked:',
        '- Empty: it has no NavigationMesh',
      ].join('\n'),
    );
  });

  it('navigation_get_path says that a path reaches the target, with its length and points', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.get_path', {
      scene: 'res://arena.tscn',
      from: 'Vector3(-9, 0, 0)',
      to: 'Vector3(-3, 0, 2)',
      reached: true,
      length: 6.4,
      point_count: 3,
      points: ['Vector3(-9, 0.5, 0)', 'Vector3(-4.5, 0.5, 1.5)', 'Vector3(-3, 0.5, 2)'],
      end: 'Vector3(-3, 0.5, 2)',
      short_by: 0,
      start_off_mesh: 0.5,
      target_off_mesh: 0.5,
      navigation_layers: [{ number: 1, name: '' }],
      unbaked_regions: [],
    });

    const result = await createNavigationGetPathTool(editor).execute({ from: [-9, 0, 0], to: [-3, 0, 2] });

    expect(editor.requests[0]?.params).toEqual({ from: [-9, 0, 0], to: [-3, 0, 2], in_game: false });
    expect(textOf(result)).toBe(
      [
        'A path from Vector3(-9, 0, 0) to Vector3(-3, 0, 2) in res://arena.tscn reaches the target: 6.4 m over 3 points, on navigation layer 1.',
        'Points: Vector3(-9, 0.5, 0), Vector3(-4.5, 0.5, 1.5), Vector3(-3, 0.5, 2)',
      ].join('\n'),
    );
  });

  it('navigation_get_path says where a path stops short and why that usually happens', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.get_path', {
      scene: 'res://arena.tscn',
      from: 'Vector3(-9, 0, 0)',
      to: 'Vector3(10, 0, 0)',
      reached: false,
      length: 7.5,
      point_count: 3,
      points: ['Vector3(-9, 0.5, 0)', 'Vector3(-6, 0.5, 0)', 'Vector3(-1.5, 0.5, 0)'],
      end: 'Vector3(-1.5, 0.5, 0)',
      short_by: 11.5,
      start_off_mesh: 0.5,
      target_off_mesh: 0.5,
      navigation_layers: [{ number: 1, name: 'ground' }],
      unbaked_regions: ['Island'],
    });

    const text = textOf(await createNavigationGetPathTool(editor).execute({ from: [-9, 0, 0], to: [10, 0, 0] }));

    expect(text).toBe(
      [
        'A path from Vector3(-9, 0, 0) to Vector3(10, 0, 0) in res://arena.tscn does not reach the target: it stops 11.5 m short, at Vector3(-1.5, 0.5, 0), after 7.5 m over 3 points, on navigation layer 1 "ground".',
        'The navigation mesh around the start does not connect to the one around the target: regions that do not touch or overlap, an obstacle or a gap between them, or a link (NavigationLink3D) that is missing.',
        'Points: Vector3(-9, 0.5, 0), Vector3(-6, 0.5, 0), Vector3(-1.5, 0.5, 0)',
        'Not baked: Island. Bake it with navigation_bake.',
      ].join('\n'),
    );
  });

  it('navigation_get_path explains an empty path and ends far from the mesh', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.get_path', {
      scene: '',
      from: 'Vector3(40, 0, 0)',
      to: 'Vector3(0, 0, 0)',
      reached: false,
      length: 0,
      point_count: 0,
      points: [],
      start_off_mesh: 30.2,
      target_off_mesh: 3.4,
      navigation_layers: [{ number: 1, name: '' }],
      unbaked_regions: [],
    });

    const text = textOf(await createNavigationGetPathTool(editor).execute({ from: [40, 0, 0], to: [0, 0, 0], in_game: true }));

    expect(text).toBe(
      [
        'No path from Vector3(40, 0, 0) to Vector3(0, 0, 0) in the running game, on navigation layer 1.',
        'The start lies 30.2 m from the navigation mesh, and the target 3.4 m.',
        'Usual causes: no baked region under these points, regions on other navigation layers, or a point far above or beside the floor.',
      ].join('\n'),
    );
  });

  it('navigation_get_path leaves out the middle of a long path', async () => {
    const editor = new FakeEditorGateway().respondTo('navigation.get_path', {
      scene: 'res://arena.tscn',
      from: 'Vector3(0, 0, 0)',
      to: 'Vector3(29, 0, 0)',
      reached: true,
      length: 29,
      point_count: 30,
      points: ['A', 'B', 'C', 'D', 'E', 'V', 'W', 'X', 'Y', 'Z'],
      points_left_out: 20,
      end: 'Z',
      short_by: 0,
      start_off_mesh: 0,
      target_off_mesh: 0,
      navigation_layers: [{ number: 1, name: '' }],
      unbaked_regions: [],
    });

    const text = textOf(await createNavigationGetPathTool(editor).execute({ from: [0, 0, 0], to: [29, 0, 0] }));

    expect(text).toContain('Points: A, B, C, D, E, … 20 more …, V, W, X, Y, Z');
  });

  it('navigation_get_path only reads', () => {
    expect(createNavigationGetPathTool(new FakeEditorGateway()).definition.annotations.readOnlyHint).toBe(true);
  });
});
