import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginSwitch, PluginSwitchError } from '../../src/addon/PluginSwitch.js';
import type { EditorStatus } from '../../src/bridge/EditorConnection.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

class FakeEditor extends FakeEditorGateway {
  constructor(private readonly connected: boolean) {
    super();
  }

  status(): Promise<EditorStatus> {
    return Promise.resolve(this.connected ? ({ connected: true, hello: {} } as unknown as EditorStatus) : { connected: false, reason: 'No editor runs.' });
  }
}

describe('switching a plugin', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-switch-')));
    writeFileSync(join(projectRoot, 'project.godot'), ['config_version=5', '', '[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg")', ''].join('\n'));
    for (const plugin of ['godot_mcp_tool', 'gut']) {
      mkdirSync(join(projectRoot, 'addons', plugin), { recursive: true });
      writeFileSync(join(projectRoot, 'addons', plugin, 'plugin.cfg'), '[plugin]\n');
    }
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('asks the editor when it is connected', async () => {
    const editor = new FakeEditor(true).respondTo('editor.set_plugin_enabled', { plugin: 'gut', enabled: true, changed: true, plugins: [] });

    const switched = await new PluginSwitch(projectRoot, editor).setEnabled('res://addons/gut/plugin.cfg', true);

    expect(editor.requests[0]?.params).toEqual({ plugin: 'gut', enabled: true });
    expect(switched).toEqual({ plugin: 'gut', enabled: true, changed: true, through: 'editor', autoloadsLeft: [] });
  });

  it('edits project.godot when no editor runs', async () => {
    const pluginSwitch = new PluginSwitch(projectRoot, new FakeEditor(false));

    const enabled = await pluginSwitch.setEnabled('gut', true);
    const again = await pluginSwitch.setEnabled('gut', true);

    expect(enabled).toEqual({ plugin: 'gut', enabled: true, changed: true, through: 'project.godot', autoloadsLeft: [] });
    expect(again.changed).toBe(false);
    expect(readFileSync(join(projectRoot, 'project.godot'), 'utf8')).toContain('"res://addons/gut/plugin.cfg"');
  });

  it('names the autoloads from the folder of a plugin that stay in project.godot after it is off', async () => {
    writeFileSync(
      join(projectRoot, 'project.godot'),
      [
        'config_version=5',
        '',
        '[autoload]',
        '',
        'GutHelper="*res://addons/gut/helper.gd"',
        'GutRunner="*uid://b1gutrunner"',
        'GameState="*res://game_state.gd"',
        '',
        '[editor_plugins]',
        '',
        'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg", "res://addons/gut/plugin.cfg")',
        '',
      ].join('\n'),
    );
    mkdirSync(join(projectRoot, 'addons', 'gut', 'runner'), { recursive: true });
    writeFileSync(join(projectRoot, 'addons', 'gut', 'runner', 'runner.gd.uid'), 'uid://b1gutrunner\n');
    const editor = new FakeEditor(true).respondTo('editor.set_plugin_enabled', {
      plugin: 'gut',
      enabled: false,
      changed: true,
      autoloads_left: [{ name: 'GutHelper', path: 'res://addons/gut/helper.gd' }],
      plugins: [],
    });

    const inEditor = await new PluginSwitch(projectRoot, editor).setEnabled('gut', false);
    const inFile = await new PluginSwitch(projectRoot, new FakeEditor(false)).setEnabled('gut', false);

    expect(inEditor.autoloadsLeft).toEqual([{ name: 'GutHelper', path: 'res://addons/gut/helper.gd' }]);
    expect(inFile).toEqual({
      plugin: 'gut',
      enabled: false,
      changed: true,
      through: 'project.godot',
      autoloadsLeft: [
        { name: 'GutHelper', path: 'res://addons/gut/helper.gd' },
        { name: 'GutRunner', path: 'res://addons/gut/runner/runner.gd' },
      ],
    });
  });

  it('refuses plugins that are missing or that carry these tools', async () => {
    const pluginSwitch = new PluginSwitch(projectRoot, new FakeEditor(false));

    await expect(pluginSwitch.setEnabled('gdUnit4', true)).rejects.toThrow(new PluginSwitchError('There is no plugin "gdUnit4" in res://addons. Plugins in res://addons: godot_mcp_tool, gut.'));
    await expect(pluginSwitch.setEnabled('godot_mcp_tool', false)).rejects.toThrow(PluginSwitchError);
  });
});
