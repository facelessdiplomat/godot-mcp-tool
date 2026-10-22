import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createAssetImportSettingsGetTool, createAssetImportSettingsSetTool } from '../../src/tools/assetTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const characterInCentimeters = {
  size: 'Vector3(50, 180, 50)',
  position: 'Vector3(-25, 0, -25)',
  nodes: [
    { path: '.', type: 'Node3D' },
    { path: 'Body', type: 'MeshInstance3D', size: 'Vector3(50, 180, 50)' },
  ],
  collision_shapes: [],
};

const characterInMeters = {
  size: 'Vector3(0.5, 1.8, 0.5)',
  position: 'Vector3(-0.25, 0, -0.25)',
  nodes: [
    { path: '.', type: 'Node3D' },
    { path: 'Body', type: 'MeshInstance3D', size: 'Vector3(0.5, 1.8, 0.5)' },
    { path: 'Body/StaticBody3D', type: 'StaticBody3D' },
    { path: 'Body/StaticBody3D/CollisionShape3D', type: 'CollisionShape3D' },
  ],
  collision_shapes: [
    { path: 'Body/StaticBody3D/CollisionShape3D', shape: 'CapsuleShape3D', dimensions: [
        { name: 'radius', value: 0.25 },
        { name: 'height', value: 1.8 },
      ], position: 'Vector3(0, 0.9, 0)' },
  ],
};

describe('asset tools', () => {
  it('asset_import_settings_get shows the imported scene, the node settings and the options', async () => {
    const editor = new FakeEditorGateway().respondTo('asset.import_settings_get', {
      path: 'res://models/character.glb',
      importer: 'scene',
      type: 'PackedScene',
      options: [
        { name: 'nodes/root_type', value: '' },
        { name: 'nodes/root_scale', value: 1 },
        { name: 'nodes/root_script', value: null },
        { name: 'materials/extract', value: 'Keep Internal' },
      ],
      node_settings: { Body: { 'generate/physics': true, 'physics/shape_type': 'Trimesh' } },
      scene: characterInCentimeters,
    });

    const result = await createAssetImportSettingsGetTool(editor).execute({ path: 'res://models/character.glb' });

    expect(editor.requests[0]?.params).toEqual({ path: 'res://models/character.glb' });
    expect(textOf(result)).toBe(
      [
        'res://models/character.glb, imported by the scene importer as PackedScene',
        'Imported scene: size Vector3(50, 180, 50), from Vector3(-25, 0, -25)',
        'Nodes: . (Node3D); Body (MeshInstance3D, size Vector3(50, 180, 50))',
        'Collision shapes: none',
        'Node settings: Body: generate/physics = true, physics/shape_type = Trimesh',
        'Options:',
        'nodes/root_type = ""',
        'nodes/root_scale = 1',
        'nodes/root_script = null',
        'materials/extract = Keep Internal',
      ].join('\n'),
    );
  });

  it('asset_import_settings_get shows only the options of an asset that is not a scene', async () => {
    const editor = new FakeEditorGateway().respondTo('asset.import_settings_get', {
      path: 'res://textures/grass.png',
      importer: 'texture',
      type: 'CompressedTexture2D',
      options: [{ name: 'mipmaps/generate', value: false }],
      node_settings: {},
      scene: null,
    });

    const result = await createAssetImportSettingsGetTool(editor).execute({ path: 'res://textures/grass.png' });

    expect(textOf(result)).toBe(['res://textures/grass.png, imported by the texture importer as CompressedTexture2D', 'Options:', 'mipmaps/generate = false'].join('\n'));
  });

  it('asset_import_settings_set reports the reimported scene with its size before and after and its collision shapes', async () => {
    const editor = new FakeEditorGateway().respondTo('asset.import_settings_set', {
      path: 'res://models/character.glb',
      applied: ['nodes/root_scale', 'Body: generate/physics', 'Body: physics/shape_type'],
      rejected: [{ name: 'Body: physics/shape', reason: 'unknown node setting. Similar: physics/shape_type.' }],
      scene_before: characterInCentimeters,
      scene: characterInMeters,
    });
    const nodes = { Body: { 'generate/physics': true, 'physics/shape_type': 'Capsule', 'physics/shape': 6 } };

    const result = await createAssetImportSettingsSetTool(editor).execute({ path: 'res://models/character.glb', options: { 'nodes/root_scale': 0.01 }, nodes });

    expect(editor.requests[0]?.params).toEqual({ path: 'res://models/character.glb', options: { 'nodes/root_scale': 0.01 }, nodes });
    expect(editor.requests[0]?.options?.timeoutMs).toBe(300_000);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Reimported res://models/character.glb.',
        'Applied: nodes/root_scale, Body: generate/physics, Body: physics/shape_type',
        'Imported scene: size Vector3(0.5, 1.8, 0.5) (was Vector3(50, 180, 50)), from Vector3(-0.25, 0, -0.25)',
        'Collision shapes: Body/StaticBody3D/CollisionShape3D: CapsuleShape3D (radius 0.25, height 1.8) at Vector3(0, 0.9, 0)',
        'Rejected:',
        '- Body: physics/shape: unknown node setting. Similar: physics/shape_type.',
      ].join('\n'),
    );
  });

  it('asset_import_settings_set fails when no setting could be applied', async () => {
    const editor = new FakeEditorGateway().respondTo('asset.import_settings_set', {
      path: 'res://models/character.glb',
      applied: [],
      rejected: [{ name: 'nodes/root_scale', reason: 'expected a number' }],
      scene_before: characterInCentimeters,
      scene: characterInCentimeters,
    });

    const result = await createAssetImportSettingsSetTool(editor).execute({ path: 'res://models/character.glb', options: { 'nodes/root_scale': 'small' } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(['The import settings of res://models/character.glb were not changed.', 'Rejected:', '- nodes/root_scale: expected a number'].join('\n'));
  });
});
