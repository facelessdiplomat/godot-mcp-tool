import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { PluginSwitchError, type SwitchedPlugin } from '../../src/addon/PluginSwitch.js';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { gdUnitFramework, gutFramework } from '../../src/testing/TestFrameworks.js';
import { PluginSetEnabledTool, TestInstallFrameworkTool } from '../../src/tools/pluginTools.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function switcher(outcome: SwitchedPlugin | Error): { setEnabled: (plugin: string, enabled: boolean) => Promise<SwitchedPlugin> } {
  return { setEnabled: () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)) };
}

describe('plugin tools', () => {
  it('plugin_set_enabled says where it turned the plugin on', async () => {
    const inEditor = await new PluginSetEnabledTool(switcher({ plugin: 'gut', enabled: true, changed: true, through: 'editor', autoloadsLeft: [] })).execute({ plugin: 'gut' });
    const inFile = await new PluginSetEnabledTool(switcher({ plugin: 'gut', enabled: false, changed: true, through: 'project.godot', autoloadsLeft: [] })).execute({ plugin: 'gut', enabled: false });
    const unchanged = await new PluginSetEnabledTool(switcher({ plugin: 'gut', enabled: true, changed: false, through: 'editor', autoloadsLeft: [] })).execute({ plugin: 'gut' });

    expect(textOf(inEditor)).toBe('Turned the plugin gut on in the editor.');
    expect(textOf(inFile)).toBe('Turned the plugin gut off in project.godot; the editor leaves it when it starts.');
    expect(textOf(unchanged)).toBe('The plugin gut is on already.');
  });

  it('plugin_set_enabled names the autoloads of a plugin turned off that the game still loads', async () => {
    const autosave = { name: 'Autosave', path: 'res://addons/autosave/autosave.gd' };
    const tracker = { name: 'SaveTracker', path: 'res://addons/autosave/tracker.gd' };
    const one = await new PluginSetEnabledTool(switcher({ plugin: 'autosave', enabled: false, changed: true, through: 'editor', autoloadsLeft: [autosave] })).execute({ plugin: 'autosave', enabled: false });
    const two = await new PluginSetEnabledTool(switcher({ plugin: 'autosave', enabled: false, changed: false, through: 'editor', autoloadsLeft: [autosave, tracker] })).execute({
      plugin: 'autosave',
      enabled: false,
    });

    expect(textOf(one)).toBe(
      [
        'Turned the plugin autosave off in the editor.',
        'Its autoload Autosave (res://addons/autosave/autosave.gd) is still in project.godot, so the game still loads it; remove it with autoload_remove if the game no longer needs it.',
      ].join('\n'),
    );
    expect(textOf(two)).toBe(
      [
        'The plugin autosave is off already.',
        'Its autoloads Autosave (res://addons/autosave/autosave.gd) and SaveTracker (res://addons/autosave/tracker.gd) are still in project.godot, so the game still loads them; remove them with autoload_remove if the game no longer needs them.',
      ].join('\n'),
    );
  });

  it('plugin_set_enabled explains a plugin it cannot switch', async () => {
    const missing = await new PluginSetEnabledTool(switcher(new PluginSwitchError('There is no plugin "gutt" in res://addons.'))).execute({ plugin: 'gutt' });
    const refused = await new PluginSetEnabledTool(switcher(new BridgeRequestError('Turning off the Godot MCP Tool plugin would cut the connection', -32602, 'Turn it off in Project Settings.', undefined))).execute({
      plugin: 'godot_mcp_tool',
      enabled: false,
    });

    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toBe('There is no plugin "gutt" in res://addons.');
    expect(textOf(refused)).toContain('Hint: Turn it off in Project Settings.');
  });

  it('test_install_framework reports the pinned release and how to write tests', async () => {
    const installer = {
      install: (key: 'gut' | 'gdunit4') =>
        Promise.resolve({
          framework: key === 'gut' ? gutFramework : gdUnitFramework,
          path: key === 'gut' ? 'res://addons/gut' : 'res://addons/gdUnit4',
          downloaded: key === 'gut',
          plugin: { plugin: key === 'gut' ? 'gut' : 'gdUnit4', enabled: true, changed: true, through: 'editor' as const, autoloadsLeft: [] },
        }),
    };
    const tool = new TestInstallFrameworkTool(installer);

    expect(tool.definition.requiresUserInteraction).toBe(true);
    expect(tool.definition.annotations.openWorldHint).toBe(true);
    expect(textOf(await tool.execute({}))).toBe(
      [
        'Installed GUT 9.7.1 (commit aeb5d4f of https://github.com/bitwes/Gut) into res://addons/gut.',
        'Turned the plugin gut on in the editor.',
        'Write tests as scripts in res://test/ that extend GutTest, such as res://test/test_player.gd, and run them with test_run.',
      ].join('\n'),
    );
    expect(textOf(await tool.execute({ framework: 'gdunit4' })).split('\n')[0]).toBe('gdUnit4 is installed in res://addons/gdUnit4 already.');
  });
});
