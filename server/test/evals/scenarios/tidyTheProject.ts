import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TemporaryProject } from '../../integration/harness.js';
import { checked, errorsOfTheRun, type Scenario, scriptsAreClean } from '../Scenario.js';
import { writeScripts } from './fixtures.js';

const crateScript = ['extends Node3D', '', 'const ICE := preload("res://materials/ice.tres")', '', '', 'func _ready() -> void:', '\tprint(ICE.resource_path)', ''].join('\n');

function filesNamed(project: TemporaryProject, name: string, folder = project.root): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.godot' || entry.name === 'addons') {
      return [];
    }
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesNamed(project, name, path) : entry.name === name ? [path] : [];
  });
}

export const tidyTheProject: Scenario = {
  name: 'tidy-the-project',
  request: 'Tidy up the project files: the materials go into a `surfaces` folder, the level goes into `levels/`, and delete the material that nothing uses.',
  projectOptions: { mainScene: 'res://level.tscn' },
  unsafeTools: true,
  async prepare({ project, tools }) {
    await tools.call('resource_create', { path: 'res://materials/ice.tres', type: 'StandardMaterial3D', properties: { albedo_color: '#aaddff' } });
    await tools.call('resource_create', { path: 'res://materials/old_ice.tres', type: 'StandardMaterial3D', properties: { albedo_color: '#cceeff' } });
    await writeScripts(project, tools, { 'crate.gd': crateScript });
    await tools.call('scene_create', { path: 'res://crate.tscn', root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_set_properties', path: '.', properties: { script: 'res://crate.gd' } },
        { op: 'node_add', type: 'MeshInstance3D', name: 'Mesh', properties: { mesh: { new: 'BoxMesh' }, material_override: 'res://materials/ice.tres' } },
      ],
    });
    await tools.call('scene_save');
    await tools.call('scene_create', { path: 'res://level.tscn', root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'res://crate.tscn', name: 'Crate', properties: { position: [0, 0.5, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 2, 5] } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ project, tools }) {
    await tools.call('filesystem_move', { from: 'res://materials', to: 'res://surfaces' });
    await writeScripts(project, tools, { 'crate.gd': crateScript.replace('res://materials/ice.tres', 'res://surfaces/ice.tres') });
    await tools.call('filesystem_delete', { paths: ['res://surfaces/old_ice.tres'] });
    await tools.call('filesystem_move', { from: 'res://level.tscn', to: 'res://levels/level.tscn' });
  },
  async check({ project, tools }) {
    const crateScene = existsSync(project.path('crate.tscn')) ? project.read('crate.tscn') : '';
    const crateCode = existsSync(project.path('crate.gd')) ? project.read('crate.gd') : '';
    const checks = [
      checked('the ice material is in surfaces/', existsSync(project.path('surfaces/ice.tres')), 'res://surfaces/ice.tres'),
      checked('materials/ is gone', !existsSync(project.path('materials')), existsSync(project.path('materials')) ? 'res://materials still exists' : 'gone'),
      checked('the crate scene uses the moved material', crateScene.includes('res://surfaces/ice.tres'), crateScene.split('\n').find((line) => line.includes('ice.tres')) ?? 'no reference'),
      checked('the crate script preloads the moved material', /preload\("(res:\/\/surfaces\/ice\.tres|uid:\/\/[^"]+)"\)/.test(crateCode), crateCode.split('\n').find((line) => line.includes('preload')) ?? ''),
      checked('the unused material is deleted', filesNamed(project, 'old_ice.tres').length === 0, filesNamed(project, 'old_ice.tres').join(', ') || 'deleted'),
      checked('the crate and the level still exist', existsSync(project.path('crate.tscn')) && existsSync(project.path('crate.gd')) && existsSync(project.path('levels/level.tscn')), 'crate.tscn, crate.gd, levels/level.tscn'),
      await scriptsAreClean(tools),
    ];
    const run = await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 20 });
    const errors = await errorsOfTheRun(tools);
    checks.push(
      checked('the main scene is the moved level', run.text.startsWith('The game is running res://levels/level.tscn'), run.text.split('\n')[0] ?? ''),
      checked('the game runs without errors', !/error/i.test(errors.split('\n').slice(1).join('\n')), errors.split('\n')[0] ?? ''),
    );
    return checks;
  },
};
