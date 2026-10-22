import type { ChildProcess } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject, testProjectRoot } from './harness.js';

const characterFixture = join(testProjectRoot, 'tests', 'fixtures', 'models', 'character.glb');

describe.skipIf(godotBinary === '')('import settings of a 3D model', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function workspace(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP asset import');
    mkdirSync(project.path('models'));
    copyFileSync(characterFixture, project.path('models/character.glb'));
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('reads the size of the model in its own units', async () => {
    const settings = await tools().call('asset_import_settings_get', { path: 'res://models/character.glb' });

    expect(settings.isError).toBe(false);
    expect(settings.text).toContain('res://models/character.glb, imported by the scene importer as PackedScene');
    expect(settings.text).toContain('Imported scene: size Vector3(50, 180, 50), from Vector3(-25, 0, -25)');
    expect(settings.text).toContain('Body (MeshInstance3D, size Vector3(50, 180, 50))');
    expect(settings.text).toContain('nodes/root_scale = 1');
  });

  it('scales the model to meters and gives it a capsule collision', async () => {
    const changed = await tools().call('asset_import_settings_set', {
      path: 'res://models/character.glb',
      options: { 'nodes/root_scale': 0.01 },
      nodes: { Body: { 'generate/physics': true, 'physics/shape_type': 'Capsule', 'primitive/radius': 25, 'primitive/height': 180 } },
    });

    expect(changed.isError).toBe(false);
    expect(changed.text).toContain('Applied: nodes/root_scale, Body: generate/physics, Body: physics/shape_type, Body: primitive/radius, Body: primitive/height');
    expect(changed.text).toContain('Imported scene: size Vector3(0.5, 1.8, 0.5) (was Vector3(50, 180, 50)), from Vector3(-0.25, 0, -0.25)');
    expect(changed.text).toContain('Body/StaticBody3D/CollisionShape3D: CapsuleShape3D (radius 0.25, height 1.8) at Vector3(0, 0.9, 0)');
    expect(workspace().read('models/character.glb.import')).toContain('nodes/root_scale=0.01');
  });

  it('gives the scenes that use the model its new size', async () => {
    await tools().call('scene_create', { path: 'res://level.tscn', root_type: 'Node3D' });
    await tools().call('node_add', { type: 'res://models/character.glb', name: 'Hero' });

    const bounds = await tools().call('node_get_bounds', { path: 'Hero' });

    expect(bounds.text).toContain('size Vector3(0.5, 1.8, 0.5)');
  });

  it('explains files that have no import settings', async () => {
    const scene = await tools().call('asset_import_settings_get', { path: 'res://level.tscn' });

    expect(scene.isError).toBe(true);
    expect(scene.text).toContain('res://level.tscn is not imported, so it has no import settings');
  });
});
