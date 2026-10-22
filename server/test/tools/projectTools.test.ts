import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import {
  createEditorRescanTool,
  createEditorSelectTool,
  createProjectInfoTool,
  createProjectSettingsGetTool,
  createProjectSettingsSetTool,
} from '../../src/tools/projectTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function projectInfoWith(globalClasses: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'Arena Shooter',
    path: '/projects/arena',
    main_scene: '',
    features: [],
    renderer: 'forward_plus',
    physics_engine_3d: 'DEFAULT',
    window: { width: 1152, height: 648, stretch_mode: 'disabled', stretch_aspect: 'keep' },
    autoloads: [],
    enabled_plugins: [],
    global_classes: globalClasses,
    indentation: { style: 'tabs', size: 4 },
    folders: [],
  };
}

describe('project tools', () => {
  it('project_info summarizes the project', async () => {
    const editor = new FakeEditorGateway().respondTo('project.info', {
      name: 'Arena Shooter',
      path: '/projects/arena',
      main_scene: 'res://levels/arena.tscn',
      features: ['4.8', 'Forward Plus'],
      renderer: 'forward_plus',
      physics_engine_3d: 'Jolt Physics',
      window: { width: 1152, height: 648, stretch_mode: 'disabled', stretch_aspect: 'keep' },
      autoloads: [{ name: 'GameState', path: 'res://autoload/game_state.gd', singleton: true }],
      enabled_plugins: ['res://addons/godot_mcp_tool/plugin.cfg'],
      global_classes: { project: [{ name: 'PatrolPoint', base: 'Marker3D', path: 'res://ai/patrol_point.gd' }], project_count: 1, addons: [] },
      indentation: { style: 'tabs', size: 4 },
      folders: ['addons', 'levels'],
    });

    const text = textOf(await createProjectInfoTool(editor).execute({}));

    expect(text).toBe(
      [
        'Project: Arena Shooter',
        'Path: /projects/arena',
        'Main scene: res://levels/arena.tscn',
        'Renderer: forward_plus; 3D physics: Jolt Physics',
        'Window: 1152×648, stretch mode disabled, aspect keep',
        'Indentation in .gd files: tabs — never mix tabs and spaces',
        'Autoloads: GameState → res://autoload/game_state.gd',
        'Enabled plugins: res://addons/godot_mcp_tool/plugin.cfg',
        'Global classes of the project (1): PatrolPoint extends Marker3D (res://ai/patrol_point.gd)',
        'Top-level folders: addons, levels',
      ].join('\n'),
    );
  });

  it('project_info lists the classes of the project and counts those of each addon', async () => {
    const editor = new FakeEditorGateway().respondTo(
      'project.info',
      projectInfoWith({
        project: [{ name: 'PatrolPoint', base: 'Marker3D', path: 'res://ai/patrol_point.gd' }],
        project_count: 1,
        addons: [
          { folder: 'gdUnit4', count: 202 },
          { folder: 'gut', count: 10 },
        ],
      }),
    );

    const text = textOf(await createProjectInfoTool(editor).execute({}));

    expect(text).toContain(
      [
        'Global classes of the project (1): PatrolPoint extends Marker3D (res://ai/patrol_point.gd)',
        'Global classes from addons: gdUnit4 (202), gut (10); look one up with docs_class',
      ].join('\n'),
    );
  });

  it('project_info says how to find the classes of the project it leaves out', async () => {
    const editor = new FakeEditorGateway().respondTo(
      'project.info',
      projectInfoWith({
        project: [
          { name: 'EnemyStats', base: 'Resource', path: 'res://ai/enemy_stats.gd' },
          { name: 'PatrolPoint', base: 'Marker3D', path: 'res://ai/patrol_point.gd' },
        ],
        project_count: 240,
        addons: [],
      }),
    );

    const text = textOf(await createProjectInfoTool(editor).execute({}));

    expect(text).toContain(
      'Global classes of the project (240, the first 2 shown; search the .gd files for class_name to find the rest): EnemyStats extends Resource (res://ai/enemy_stats.gd); PatrolPoint extends Marker3D (res://ai/patrol_point.gd)\n',
    );
  });

  it('project_info says when only addons declare global classes', async () => {
    const editor = new FakeEditorGateway().respondTo('project.info', projectInfoWith({ project: [], project_count: 0, addons: [{ folder: 'gut', count: 10 }] }));

    const text = textOf(await createProjectInfoTool(editor).execute({}));

    expect(text).toContain(['Global classes of the project: none', 'Global classes from addons: gut (10); look one up with docs_class'].join('\n'));
  });

  it('editor_select names what it selected', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.select', { scene: 'res://levels/arena.tscn', nodes: ['Player', 'Player/Camera'] }, { file: 'res://materials/ice.tres' });

    const nodes = await createEditorSelectTool(editor).execute({ nodes: ['Player', 'Player/Camera'] });
    const file = await createEditorSelectTool(editor).execute({ file: 'res://materials/ice.tres' });

    expect(textOf(nodes)).toBe('Selected Player, Player/Camera in res://levels/arena.tscn in the editor.');
    expect(textOf(file)).toBe('Selected res://materials/ice.tres in the FileSystem dock of the editor.');
  });

  it('project_settings_get lists values and unknown names', async () => {
    const editor = new FakeEditorGateway().respondTo('project.settings_get', {
      settings: [{ name: 'application/run/main_scene', value: 'res://main.tscn' }],
      unknown: [{ name: 'application/run/main', reason: 'There is no project setting "application/run/main". Similar: application/run/main_scene.' }],
      truncated: false,
    });

    const text = textOf(await createProjectSettingsGetTool(editor).execute({ names: ['application/run/main_scene', 'application/run/main'] }));

    expect(text).toBe(
      [
        'application/run/main_scene = "res://main.tscn"',
        'application/run/main: There is no project setting "application/run/main". Similar: application/run/main_scene.',
      ].join('\n'),
    );
  });

  it('project_settings_set reports applied settings and previous values', async () => {
    const editor = new FakeEditorGateway().respondTo('project.settings_set', {
      applied: ['application/run/main_scene'],
      rejected: [],
      not_applied: [],
      previous: { 'application/run/main_scene': '' },
    });

    const text = textOf(await createProjectSettingsSetTool(editor).execute({ values: { 'application/run/main_scene': 'res://levels/arena.tscn' } }));

    expect(text).toBe('Saved project.godot.\nApplied: application/run/main_scene\nPrevious values: application/run/main_scene = ""');
  });

  it('editor_rescan reports the duration', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.rescan', { duration_ms: 120 });

    const text = textOf(await createEditorRescanTool(editor).execute({}));

    expect(text).toBe('The editor rescanned the project files in 120 ms and reloaded scripts changed on disk.');
  });
});
