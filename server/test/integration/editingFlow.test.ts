import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

describe.skipIf(godotBinary === '')('editing a project through the MCP tools', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function projectFile(relativePath: string): string {
    if (project === undefined) {
      throw new Error('The temporary project was not created');
    }
    return project.path(relativePath);
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP editing flow');
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('creates a scene and opens it', async () => {
    const created = await tools().call('scene_create', { path: 'res://levels/arena.tscn', root_type: 'Node3D' });

    expect(created).toEqual({
      isError: false,
      text: 'Created res://levels/arena.tscn with the root Arena (Node3D) and opened it in the editor. It is saved; later changes need scene_save.',
    });
  });

  it('adds nodes with their properties', async () => {
    const floor = await tools().call('node_add', {
      type: 'CSGBox3D',
      name: 'Floor',
      properties: { size: [20, 1, 20], use_collision: true, position: [0, -0.5, 0] },
    });
    const sun = await tools().call('node_add', { type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } });
    const environment = await tools().call('node_add', {
      type: 'WorldEnvironment',
      name: 'Environment',
      properties: {
        environment: { new: 'Environment', background_mode: 'Sky', sky: { new: 'Sky', sky_material: { new: 'ProceduralSkyMaterial' } } },
      },
    });
    const camera = await tools().call('node_add', { type: 'Camera3D', name: 'Camera', properties: { position: [0, 12, 14], rotation_degrees: [-40, 0, 0] } });

    expect(floor.text).toBe('Added Floor (CSGBox3D) to res://levels/arena.tscn. The scene has unsaved changes.\nApplied: size, use_collision, position');
    expect(sun.text).toContain('Applied: rotation_degrees, shadow_enabled');
    expect(environment.text).toContain('Applied: environment');
    expect(camera.text).toContain('Applied: position, rotation_degrees');
  });

  it('draws the scene tree', async () => {
    const tree = await tools().call('scene_get_tree');

    expect(tree.text).toBe(
      [
        'res://levels/arena.tscn (unsaved changes)',
        'Arena: Node3D',
        '├─ Floor: CSGBox3D',
        '├─ Sun: DirectionalLight3D',
        '├─ Environment: WorldEnvironment',
        '└─ Camera: Camera3D',
      ].join('\n'),
    );
  });

  it('reads properties back with their types', async () => {
    const properties = await tools().call('node_get_properties', { path: 'Floor', names: ['size', 'use_collision'] });

    expect(properties.text).toBe(['Floor (CSGBox3D) in res://levels/arena.tscn', 'size = Vector3(20, 1, 20)  [Vector3]', 'use_collision = true  [bool]'].join('\n'));
  });

  it('applies what it can and explains what it cannot', async () => {
    const updated = await tools().call('node_set_properties', { path: 'Floor', properties: { size: [30, 1, 30], use_colision: false } });

    expect(updated.isError).toBe(false);
    expect(updated.text).toContain('Applied: size');
    expect(updated.text).toContain('- use_colision: CSGBox3D has no property "use_colision". Similar: use_collision');
  });

  it('suggests similar node paths for a missing node', async () => {
    const missing = await tools().call('node_set_properties', { path: 'Flor', properties: { visible: false } });

    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Node "Flor" not found');
    expect(missing.text).toContain('Floor');
  });

  it('reports an engine error in the response of the call that caused it', async () => {
    const updated = await tools().call('node_set_properties', { path: 'Camera', properties: { fov: 200 } });

    expect(updated.isError).toBe(true);
    expect(updated.text).toContain('- fov: wanted 200, got 75');
    expect(updated.text).toMatch(/\n\n⚠ New error since the last call:\n- in the editor: scene\/3d\/camera_3d\.cpp:\d+: Condition .*p_fov/);
  });

  it('saves the scene to disk', async () => {
    const saved = await tools().call('scene_save');

    expect(saved.text).toBe('Saved res://levels/arena.tscn.');
    const sceneText = readFileSync(projectFile('levels/arena.tscn'), 'utf8');
    expect(sceneText).toContain('[node name="Floor" type="CSGBox3D" parent="."');
    expect(sceneText).toContain('size = Vector3(30, 1, 30)');
  });

  it('makes the scene the main scene', async () => {
    const changed = await tools().call('project_settings_set', { values: { 'application/run/main_scene': 'res://levels/arena.tscn' } });
    const read = await tools().call('project_settings_get', { names: ['application/run/main_scene'] });
    const info = await tools().call('project_info');

    expect(changed.text).toContain('Saved project.godot.\nApplied: application/run/main_scene');
    expect(read.text).toBe('application/run/main_scene = "res://levels/arena.tscn"');
    expect(info.text).toContain('Main scene: res://levels/arena.tscn');
    expect(readFileSync(projectFile('project.godot'), 'utf8')).toContain('run/main_scene=');
  });

  it('picks up a scene written to disk and reads it without opening it', async () => {
    mkdirSync(projectFile('props'));
    writeFileSync(projectFile('props/barrel.tscn'), '[gd_scene format=3]\n\n[node name="Barrel" type="Node3D"]\n\n[node name="Body" type="MeshInstance3D" parent="."]\n');

    const rescan = await tools().call('editor_rescan');
    const tree = await tools().call('scene_get_tree', { scene: 'res://props/barrel.tscn' });

    expect(rescan.text).toContain('The editor rescanned the project files');
    expect(tree.text).toBe(['res://props/barrel.tscn', 'Barrel: Node3D', '└─ Body: MeshInstance3D'].join('\n'));
  });

  it('instances one scene in another', async () => {
    const added = await tools().call('node_add', { type: 'res://props/barrel.tscn', properties: { position: [3, 0, 2] } });
    const tree = await tools().call('scene_get_tree');

    expect(added.text).toContain('Added Barrel (Node3D) to res://levels/arena.tscn.');
    expect(tree.text).toContain('Barrel: Node3D [instance res://props/barrel.tscn]');
  });

  it('deletes nodes', async () => {
    const deleted = await tools().call('node_delete', { paths: ['Sun'] });
    const tree = await tools().call('scene_get_tree');

    expect(deleted.text).toBe('Deleted Sun from res://levels/arena.tscn. The scene has unsaved changes; Ctrl+Z in the editor brings them back.');
    expect(tree.text).not.toContain('Sun');
  });
});
