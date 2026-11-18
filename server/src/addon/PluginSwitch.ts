import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as z from 'zod/v4';
import type { EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { readConfigSections } from '../project/ConfigText.js';
import { addonFolderName } from './InstalledAddon.js';
import { isPluginPathEnabled, withPlugin } from './PluginActivation.js';

export interface PluginAutoload {
  readonly name: string;
  readonly path: string;
}

export interface SwitchedPlugin {
  readonly plugin: string;
  readonly enabled: boolean;
  readonly changed: boolean;
  readonly through: 'editor' | 'project.godot';
  readonly autoloadsLeft: readonly PluginAutoload[];
}

export class PluginSwitchError extends Error {
  override readonly name = 'PluginSwitchError';
}

const switchedSchema = z.object({
  plugin: z.string(),
  enabled: z.boolean(),
  changed: z.boolean(),
  autoloads_left: z.array(z.object({ name: z.string(), path: z.string() })).default([]),
});
const addonsFolder = 'addons';
const pluginFile = 'plugin.cfg';
const projectFile = 'project.godot';
const pathPrefix = 'res://addons/';
const pathSuffix = '/plugin.cfg';
const autoloadSection = 'autoload';
const singletonMark = '*';
const uidFileExtension = '.uid';

export class PluginSwitch {
  constructor(
    private readonly projectRoot: string | undefined,
    private readonly editor: EditorGateway & EditorStatusProvider,
  ) {}

  async setEnabled(requested: string, enabled: boolean): Promise<SwitchedPlugin> {
    const plugin = requested.replace(pathPrefix, '').replace(pathSuffix, '').replace(/\/$/, '');
    if ((await this.editor.status()).connected) {
      const { autoloads_left: autoloadsLeft, ...switched } = switchedSchema.parse(await this.editor.request('editor.set_plugin_enabled', { plugin, enabled }));
      return { ...switched, through: 'editor', autoloadsLeft };
    }
    return this.switchInProjectFile(plugin, enabled);
  }

  private switchInProjectFile(plugin: string, enabled: boolean): SwitchedPlugin {
    if (this.projectRoot === undefined) {
      throw new PluginSwitchError('No Godot project was found, so there are no plugins to switch. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const known = pluginsIn(this.projectRoot);
    if (!known.includes(plugin)) {
      throw new PluginSwitchError(`There is no plugin "${plugin}" in res://addons. ${known.length === 0 ? 'res://addons has no plugin with a plugin.cfg.' : `Plugins in res://addons: ${known.join(', ')}.`}`);
    }
    if (plugin === addonFolderName && !enabled) {
      throw new PluginSwitchError('Turning off the Godot MCP Tool plugin would cut the connection these tools work through.');
    }
    const projectPath = join(this.projectRoot, projectFile);
    const projectText = readFileSync(projectPath, 'utf8');
    const pluginPath = `${pathPrefix}${plugin}${pathSuffix}`;
    const changed = isPluginPathEnabled(projectText, pluginPath) !== enabled;
    if (changed) {
      writeFileSync(projectPath, withPlugin(projectText, pluginPath, enabled));
    }
    return { plugin, enabled, changed, through: 'project.godot', autoloadsLeft: enabled ? [] : autoloadsInside(projectText, this.projectRoot, plugin) };
  }
}

function autoloadsInside(projectText: string, projectRoot: string, plugin: string): PluginAutoload[] {
  const folder = `${pathPrefix}${plugin}/`;
  const pathsByUid = resourcePathsByUid(join(projectRoot, addonsFolder, plugin), folder);
  const autoloads = readConfigSections(projectText).find((section) => section.name === autoloadSection)?.values ?? new Map<string, string>();
  return [...autoloads]
    .map(([name, value]) => {
      const target = value.startsWith(singletonMark) ? value.slice(singletonMark.length) : value;
      return { name, path: pathsByUid.get(target) ?? target };
    })
    .filter((autoload) => autoload.path.startsWith(folder));
}

function resourcePathsByUid(directory: string, resourceFolder: string): Map<string, string> {
  const pathsByUid = new Map<string, string>();
  if (!existsSync(directory)) {
    return pathsByUid;
  }
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(uidFileExtension)) {
      const uidFile = join(entry.parentPath, entry.name);
      const resourcePath = `${resourceFolder}${relative(directory, uidFile).replaceAll('\\', '/').slice(0, -uidFileExtension.length)}`;
      pathsByUid.set(readFileSync(uidFile, 'utf8').trim(), resourcePath);
    }
  }
  return pathsByUid;
}

function pluginsIn(projectRoot: string): string[] {
  const addons = join(projectRoot, addonsFolder);
  if (!existsSync(addons)) {
    return [];
  }
  return readdirSync(addons, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(addons, entry.name, pluginFile)))
    .map((entry) => entry.name)
    .sort();
}
