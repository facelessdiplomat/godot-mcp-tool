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
      global_classes: [{ name: 'PatrolPoint', base: 'Marker3D', path: 'res://ai/patrol_point.gd' }],
      global_class_count: 1,
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
        'Global classes (1): PatrolPoint extends Marker3D (res://ai/patrol_point.gd)',
        'Top-level folders: addons, levels',
      ].join('\n'),
    );
  });

  it('project_info says which global classes it shows when there are many', async () => {
    const editor = new FakeEditorGateway().respondTo('project.info', {
      name: 'Arena Shooter',
      path: '/projects/arena',
      main_scene: '',
      features: [],
      renderer: 'forward_plus',
      physics_engine_3d: 'DEFAULT',
      window: { width: 1152, height: 648, stretch_mode: 'disabled', stretch_aspect: 'keep' },
      autoloads: [],
      enabled_plugins: [],
      global_classes: [
        { name: 'PatrolPoint', base: 'Marker3D', path: 'res://ai/patrol_point.gd' },
        { name: 'CmdOption', base: 'RefCounted', path: 'res://addons/gdUnit4/src/cmd/CmdOption.gd' },
      ],
      global_class_count: 240,
      indentation: { style: 'tabs', size: 4 },
      folders: [],
    });

    const text = textOf(await createProjectInfoTool(editor).execute({}));

    expect(text).toContain(
      "Global classes (240, the first 2 shown, the project's own before those of addons): PatrolPoint extends Marker3D (res://ai/patrol_point.gd); CmdOption extends RefCounted (res://addons/gdUnit4/src/cmd/CmdOption.gd)",
    );
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
