import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const pluginConfig = ['[plugin]', '', 'name="Autosave"', 'description="Saves the game."', 'author="Test"', 'version="1.0"', 'script="plugin.gd"', ''].join('\n');

const pluginScript = [
  '@tool',
  'extends EditorPlugin',
  '',
  '',
  'func _enable_plugin() -> void:',
  '\tadd_autoload_singleton("Autosave", "res://addons/autosave/autosave.gd")',
  '',
  '',
  'func _disable_plugin() -> void:',
  '\tremove_autoload_singleton("Autosave")',
  '',
].join('\n');

const autosaveScript = ['extends Node', '', 'var saves := 0', ''].join('\n');

const pluginPath = 'res://addons/autosave/plugin.cfg';
const autoloadLine = 'Autosave="*res://addons/autosave/autosave.gd"';

describe.skipIf(godotBinary === '')('turning a plugin on and off in the running editor', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function settings(): string {
    return project?.read('project.godot') ?? '';
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP plugins');
    mkdirSync(project.path('addons/autosave'), { recursive: true });
    project.write('addons/autosave/plugin.cfg', pluginConfig);
    project.write('addons/autosave/plugin.gd', pluginScript);
    project.write('addons/autosave/autosave.gd', autosaveScript);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('writes the plugin and the autoload that it adds into project.godot at once, and names the autoload if it stays after the plugin is off', async () => {
    const turnedOn = await tools().call('plugin_set_enabled', { plugin: 'autosave' });
    const settingsWithThePlugin = settings();
    const turnedOff = await tools().call('plugin_set_enabled', { plugin: 'autosave', enabled: false });
    const settingsWithoutThePlugin = settings();

    expect(turnedOn.text).toBe('Turned the plugin autosave on in the editor.');
    expect(settingsWithThePlugin).toContain(`"${pluginPath}"`);
    expect(settingsWithThePlugin).toContain(autoloadLine);
    expect(turnedOff.text.split('\n')[0]).toBe('Turned the plugin autosave off in the editor.');
    expect(settingsWithoutThePlugin).not.toContain(pluginPath);
    expect(turnedOff.text.includes('Its autoload Autosave (res://addons/autosave/autosave.gd) is still in project.godot')).toBe(settingsWithoutThePlugin.includes(autoloadLine));
  });
});
