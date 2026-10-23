import { describe, expect, it } from 'vitest';
import { isPluginEnabled, withPluginEnabled } from '../../src/addon/PluginActivation.js';

const pluginLine = 'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg")';

describe('enabling the plugin in project.godot', () => {
  it('adds the editor plugins section in the place where Godot keeps it', () => {
    const project = ['config_version=5', '', '[application]', '', 'config/name="Game"', '', '[rendering]', '', 'anti_aliasing/quality/msaa_3d=2', ''].join('\n');

    expect(withPluginEnabled(project)).toBe(
      ['config_version=5', '', '[application]', '', 'config/name="Game"', '', '[editor_plugins]', '', pluginLine, '', '[rendering]', '', 'anti_aliasing/quality/msaa_3d=2', ''].join('\n'),
    );
  });

  it('adds the section at the end when every other section comes before it', () => {
    const project = ['config_version=5', '', '[application]', '', 'config/name="Game"', ''].join('\n');

    expect(withPluginEnabled(project)).toBe(['config_version=5', '', '[application]', '', 'config/name="Game"', '', '[editor_plugins]', '', pluginLine, ''].join('\n'));
  });

  it('keeps the plugins that are already enabled', () => {
    const project = ['[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/gut/plugin.cfg")', ''].join('\n');

    expect(withPluginEnabled(project)).toBe(
      ['[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/gut/plugin.cfg", "res://addons/godot_mcp_tool/plugin.cfg")', ''].join('\n'),
    );
  });

  it('adds the list to a section that has none', () => {
    const project = ['[editor_plugins]', '', '[input]', ''].join('\n');

    expect(withPluginEnabled(project)).toBe(['[editor_plugins]', '', pluginLine, '', '[input]', ''].join('\n'));
  });

  it('leaves a project that already enables the plugin as it is', () => {
    const project = ['[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg", "res://addons/gut/plugin.cfg")', ''].join('\n');

    expect(withPluginEnabled(project)).toBe(project);
  });

  it('tells whether the plugin is enabled', () => {
    expect(isPluginEnabled(['[editor_plugins]', '', pluginLine, ''].join('\n'))).toBe(true);
    expect(isPluginEnabled(['[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/gut/plugin.cfg")', ''].join('\n'))).toBe(false);
    expect(isPluginEnabled(['[application]', '', 'config/name="Game"', ''].join('\n'))).toBe(false);
  });
});
