import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const enemyStatsScript = ['class_name EnemyStats', 'extends Resource', '', '@export var health := 10', '@export var speed := 2.5', ''].join('\n');

describe.skipIf(godotBinary === '')('creating and changing resource files', () => {
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
    project = new TemporaryProject('MCP resources');
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('creates a physics material file and reads it back', async () => {
    const created = await tools().call('resource_create', { path: 'res://materials/ice.tres', type: 'PhysicsMaterial', properties: { friction: 0.05 } });
    const read = await tools().call('resource_get', { path: 'res://materials/ice.tres' });

    expect(created.text).toBe('Created res://materials/ice.tres (PhysicsMaterial).\nApplied: friction');
    expect(workspace().read('materials/ice.tres')).toContain('friction = 0.05');
    expect(read.text).toBe('res://materials/ice.tres (PhysicsMaterial)\nfriction = 0.05  [float]');
  });

  it('changes a material that a node uses and saves the file', async () => {
    await tools().call('scene_create', { path: 'res://rink.tscn', root_type: 'Node3D' });
    await tools().call('node_add', { type: 'StaticBody3D', name: 'Floor', properties: { physics_material_override: 'res://materials/ice.tres' } });
    await tools().call('scene_save');

    const changed = await tools().call('resource_set_properties', { path: 'res://materials/ice.tres', properties: { friction: 0.02, bounce: 0.1 } });
    const floor = await tools().call('node_get_properties', { path: 'Floor', names: ['physics_material_override'] });

    expect(changed.text).toBe('Updated res://materials/ice.tres (PhysicsMaterial) and saved it.\nApplied: friction, bounce');
    expect(workspace().read('materials/ice.tres')).toContain('friction = 0.02');
    expect(workspace().read('rink.tscn')).toContain('path="res://materials/ice.tres"');
    expect(floor.text).toContain('physics_material_override = res://materials/ice.tres');
  });

  it('creates a resource of a class of the project', async () => {
    workspace().write('enemy_stats.gd', enemyStatsScript);
    await tools().call('editor_rescan');

    const created = await tools().call('resource_create', { path: 'res://stats/goblin.tres', type: 'EnemyStats', properties: { health: 30 } });

    expect(created.text).toBe('Created res://stats/goblin.tres (EnemyStats).\nApplied: health');
    expect(workspace().read('stats/goblin.tres')).toContain('health = 30');
  });

  it('explains what it cannot do', async () => {
    const existing = await tools().call('resource_create', { path: 'res://materials/ice.tres', type: 'PhysicsMaterial' });
    const scene = await tools().call('resource_get', { path: 'res://rink.tscn' });

    expect(existing).toEqual({ isError: true, text: 'res://materials/ice.tres already exists\nHint: Change it with resource_set_properties, or choose another path.' });
    expect(scene.isError).toBe(true);
    expect(scene.text).toContain('scene_get_tree');
  });
});
