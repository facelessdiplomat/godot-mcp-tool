import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createNavigationBakeTool } from '../../src/tools/navigationTools.js';
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
});
