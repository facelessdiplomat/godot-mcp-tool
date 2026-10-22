import type { ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject, testProjectRoot } from './harness.js';

const characterFixture = join(testProjectRoot, 'tests', 'fixtures', 'models', 'character.glb');

function crateScript(materialPath: string): string {
  return ['extends Node3D', '', `const SKIN := preload("${materialPath}")`, ''].join('\n');
}

const unsafeToolsAllowed = ['[godot_mcp_tool]', '', 'allow_unsafe_tools=true', ''].join('\n');

describe.skipIf(godotBinary === '')('moving and deleting the files of a project', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function scratch(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP file tools', { mainScene: 'res://level.tscn' });
    mkdirSync(project.path('.godot/editor'), { recursive: true });
    project.write('.godot/editor/project_metadata.cfg', unsafeToolsAllowed);
    copyFileSync(characterFixture, project.path('Character.glb'));
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_MCP_UNSAFE: '1' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('builds a level with a crate whose scene and script use a shared material', async () => {
    await tools().call('resource_create', { path: 'res://materials/ice.tres', type: 'StandardMaterial3D', properties: { albedo_color: '#cce6ff' } });
    scratch().write('crate.gd', crateScript('res://materials/ice.tres'));
    await tools().call('editor_rescan');
    await tools().call('scene_create', { path: 'res://crate.tscn', root_type: 'Node3D' });
    await tools().call('node_set_properties', { path: '.', properties: { script: 'res://crate.gd' } });
    await tools().call('node_add', { type: 'MeshInstance3D', name: 'Mesh', properties: { mesh: { new: 'BoxMesh' }, material_override: 'res://materials/ice.tres' } });
    await tools().call('scene_save');
    await tools().call('scene_create', { path: 'res://level.tscn', root_type: 'Node3D' });
    await tools().call('node_add', { type: 'res://crate.tscn', name: 'Crate' });
    const saved = await tools().call('scene_save');

    expect(saved.isError).toBe(false);
  });

  it('finds the scene and the script that use the material', async () => {
    const usages = await tools().call('resource_find_usages', { path: 'res://materials/ice.tres' });

    expect(usages.text).toMatch(
      /^res:\/\/materials\/ice\.tres \(uid:\/\/[a-z0-9]+\)\nUsed by:\n- res:\/\/crate\.tscn\nNamed in code:\n- res:\/\/crate\.gd:3: const SKIN := preload\("res:\/\/materials\/ice\.tres"\)$/,
    );
  });

  it('moves the materials folder, updates the open crate scene and lists the script to change', async () => {
    const moved = await tools().call('filesystem_move', { from: 'res://materials', to: 'res://surfaces' });

    expect(moved.text).toBe(
      [
        'Moved the folder res://materials/ with 1 file to res://surfaces/. Moves are not in the Undo history; move it back with filesystem_move if needed.',
        'Updated the paths in: res://crate.tscn',
        'Scripts still name the old paths; change them:',
        '- res://crate.gd:3: const SKIN := preload("res://materials/ice.tres")',
      ].join('\n'),
    );
    expect(existsSync(scratch().path('materials'))).toBe(false);
    expect(scratch().read('crate.tscn')).toContain('path="res://surfaces/ice.tres"');

    scratch().write('crate.gd', crateScript('res://surfaces/ice.tres'));
    await tools().call('editor_rescan');
    const material = await tools().call('node_get_properties', { scene: 'res://crate.tscn', path: 'Mesh', names: ['material_override'] });

    expect(material.text).toContain('res://surfaces/ice.tres');
  });

  it('moves the main scene and points the project setting at its new path', async () => {
    const moved = await tools().call('filesystem_move', { from: 'res://level.tscn', to: 'res://levels/level.tscn' });

    expect(moved.text).toBe(
      [
        'Moved res://level.tscn to res://levels/level.tscn. Moves are not in the Undo history; move it back with filesystem_move if needed.',
        'Project settings now: application/run/main_scene = res://levels/level.tscn',
      ].join('\n'),
    );
    expect(scratch().read('project.godot')).toContain('run/main_scene="res://levels/level.tscn"');

    const run = await tools().call('game_run');

    expect(run.text).toMatch(/^The game is running res:\/\/levels\/level\.tscn/);
    expect(run.text).not.toContain('⚠');
  });

  it('moves and renames an imported model, which is imported again at its new path', async () => {
    const moved = await tools().call('filesystem_move', { from: 'res://Character.glb', to: 'res://models/character.glb' });

    expect(moved.text).toBe('Moved res://Character.glb to res://models/character.glb. Moves are not in the Undo history; move it back with filesystem_move if needed.');
    expect(readdirSync(scratch().path('models')).sort()).toEqual(['character.glb', 'character.glb.import']);
    expect(existsSync(scratch().path('Character.glb.import'))).toBe(false);

    const showcase = await tools().call('scene_create', { path: 'res://showcase.tscn', root_type: 'res://models/character.glb' });

    expect(showcase.isError).toBe(false);
    expect(showcase.text).not.toContain('⚠');
  });

  it('renames a script when only the case of its name changes', async () => {
    scratch().write('Notes.gd', 'extends Node\n');
    await tools().call('editor_rescan');

    const renamed = await tools().call('filesystem_move', { from: 'res://Notes.gd', to: 'res://notes.gd' });

    expect(renamed.text).toBe('Moved res://Notes.gd to res://notes.gd. Moves are not in the Undo history; move it back with filesystem_move if needed.');
    expect(readdirSync(scratch().root)).toContain('notes.gd');
    expect(readdirSync(scratch().root)).not.toContain('Notes.gd');
  });

  it('keeps the material when asked to delete it, because the crate still uses it', async () => {
    const refused = await tools().call('filesystem_delete', { paths: ['res://surfaces/ice.tres'] });

    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(
      [
        'Nothing was deleted: the project still uses res://surfaces/ice.tres.',
        'Used by:',
        '- res://crate.tscn: res://surfaces/ice.tres',
        'Named in code:',
        '- res://crate.gd:3: const SKIN := preload("res://surfaces/ice.tres")',
        'Change those first, or pass force: true to delete anyway.',
      ].join('\n'),
    );
    expect(existsSync(scratch().path('surfaces/ice.tres'))).toBe(true);
  });
});
