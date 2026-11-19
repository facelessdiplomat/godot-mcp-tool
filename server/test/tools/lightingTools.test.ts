import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createVoxelGiBakeTool } from '../../src/tools/lightingTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const caveLight = {
  path: 'VoxelGI',
  data: 'res://cave.VoxelGI_data.res',
  bytes: 100_352,
  subdiv: 128,
  size: [10, 6, 14],
  geometry: true,
  warnings: [],
};

describe('lighting tools', () => {
  it('voxelgi_bake says where the data of each VoxelGI went and how large it is', async () => {
    const editor = new FakeEditorGateway().respondTo('voxelgi.bake', { scene: 'res://cave.tscn', baked: [caveLight] });

    const result = await createVoxelGiBakeTool(editor).execute({ scene: 'res://cave.tscn' });

    expect(editor.requests[0]).toMatchObject({ method: 'voxelgi.bake', params: { scene: 'res://cave.tscn' } });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe(
      [
        'Baked the VoxelGI of res://cave.tscn as one Undo step; the scene has unsaved changes, so save it with scene_save to keep the link to the data.',
        '- VoxelGI: 128 subdivisions over 10 × 6 × 14 m, data in res://cave.VoxelGI_data.res (98.0 KB)',
        'Bake again after the geometry inside changes. energy and propagation of the data make the bounced light stronger.',
      ].join('\n'),
    );
  });

  it('voxelgi_bake points out a VoxelGI that found nothing to bake, and passes on the warnings of the node', async () => {
    const editor = new FakeEditorGateway().respondTo('voxelgi.bake', {
      scene: 'res://cave.tscn',
      baked: [caveLight, { ...caveLight, path: 'Cellar/VoxelGI', data: 'res://cave.VoxelGI2_data.res', bytes: 640, geometry: false, warnings: ['A warning of the node.'] }],
    });

    const text = textOf(await createVoxelGiBakeTool(editor).execute({}));

    expect(text).toContain('Baked the VoxelGI nodes VoxelGI, Cellar/VoxelGI of res://cave.tscn as one Undo step;');
    expect(text).toContain(
      '- Cellar/VoxelGI: 128 subdivisions over 10 × 6 × 14 m, data in res://cave.VoxelGI2_data.res (640 B), but it found no mesh or CSG shape with GI mode Static inside its box, so it bounces no light: move it over the geometry or make its size cover it',
    );
    expect(text).toContain('  Warning: A warning of the node.');
  });

  it('voxelgi_bake fails when no VoxelGI found anything to bake', async () => {
    const editor = new FakeEditorGateway().respondTo('voxelgi.bake', { scene: 'res://cave.tscn', baked: [{ ...caveLight, geometry: false }] });

    const result = await createVoxelGiBakeTool(editor).execute({ path: 'VoxelGI' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^No VoxelGI of res:\/\/cave\.tscn found geometry to bake\./);
  });
});
