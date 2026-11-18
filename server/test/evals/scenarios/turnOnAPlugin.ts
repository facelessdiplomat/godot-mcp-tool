import { agentUsed, type CheckResult, checked, type Scenario } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const pluginConfig = ['[plugin]', '', 'name="Autosave"', 'description="Saves the game every few seconds."', 'author="Eval"', 'version="1.0"', 'script="plugin.gd"', ''].join('\n');

const pluginScript = [
  '@tool',
  'extends EditorPlugin',
  '',
  'const AUTOLOAD_NAME := "Autosave"',
  '',
  '',
  'func _enable_plugin() -> void:',
  '\tadd_autoload_singleton(AUTOLOAD_NAME, "res://addons/autosave/autosave.gd")',
  '',
  '',
  'func _disable_plugin() -> void:',
  '\tremove_autoload_singleton(AUTOLOAD_NAME)',
  '',
].join('\n');

const autosaveScript = [
  'extends Node',
  '',
  '@export var interval := 30.0',
  '',
  'var saves := 0',
  '',
  '',
  'func _ready() -> void:',
  '\tvar timer := Timer.new()',
  '\ttimer.wait_time = interval',
  '\ttimer.timeout.connect(save_now)',
  '\tadd_child(timer)',
  '\ttimer.start()',
  '',
  '',
  'func save_now() -> void:',
  '\tsaves += 1',
  '',
].join('\n');

const enabledPluginPattern = /^enabled=PackedStringArray\([^)]*"res:\/\/addons\/autosave\/plugin\.cfg"/m;
const autoloadPattern = /^Autosave="\*(?:res:\/\/addons\/autosave\/autosave\.gd|uid:\/\/\w+)"$/m;

export const turnOnAPlugin: Scenario = {
  name: 'turn-on-a-plugin',
  request: 'There is an autosave plugin in the addons folder. Turn it on for this project.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, {
      'addons/autosave/plugin.cfg': pluginConfig,
      'addons/autosave/plugin.gd': pluginScript,
      'addons/autosave/autosave.gd': autosaveScript,
    });
    await buildArena(tools, arenaOperations());
  },
  async solve({ tools }) {
    await tools.call('plugin_set_enabled', { plugin: 'autosave' });
  },
  async check({ project, tools, agent }) {
    const settings = project.read('project.godot');
    await tools.call('game_run');
    const singleton = await tools.call('game_get_properties', { path: '/root/Autosave', names: ['interval'] });
    const checks: CheckResult[] = [
      checked('project.godot lists the plugin as enabled', enabledPluginPattern.test(settings), settings.split('\n').find((line) => line.startsWith('enabled=')) ?? 'no enabled plugins'),
      checked('the plugin added its Autosave autoload when it was turned on', autoloadPattern.test(settings), settings.includes('[autoload]') ? 'project.godot has other autoloads' : 'project.godot has no autoloads'),
      checked('the running game has the Autosave singleton', !singleton.isError && /interval = 30\b/.test(singleton.text), singleton.text.split('\n').slice(0, 2).join(' ')),
      ...agentUsed(agent, ['plugin_set_enabled'], 'the agent turned the plugin on with plugin_set_enabled'),
    ];
    return checks;
  },
};
