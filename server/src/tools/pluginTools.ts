import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { type PluginAutoload, PluginSwitchError, type SwitchedPlugin } from '../addon/PluginSwitch.js';
import { BridgeConnectionError, BridgeProtocolError, BridgeRequestError } from '../bridge/BridgeErrors.js';
import { EditorUnavailableError } from '../editor/EditorGateway.js';
import { type InstalledFramework, TestFrameworkInstallError } from '../testing/TestFrameworkInstaller.js';
import type { TestFrameworkKey } from '../testing/TestFrameworks.js';
import { describeRequestFailure } from './bridge/BridgeTool.js';
import { changingAnnotations } from './annotations.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface PluginSwitcher {
  setEnabled(plugin: string, enabled: boolean): Promise<SwitchedPlugin>;
}

export interface FrameworkInstaller {
  install(key: TestFrameworkKey): Promise<InstalledFramework>;
}

const pluginSetEnabledInput = z.object({
  plugin: z.string().min(1).describe('The plugin, by its folder in res://addons, such as "gut", or by its plugin.cfg, such as "res://addons/gut/plugin.cfg".'),
  enabled: z.boolean().default(true).describe('true (default) turns the plugin on, false turns it off.'),
});

export class PluginSetEnabledTool implements Tool<typeof pluginSetEnabledInput> {
  readonly name = 'plugin_set_enabled';

  readonly definition: ToolDefinition<typeof pluginSetEnabledInput> = {
    title: 'Enable plugin',
    description:
      'Turn an editor plugin of res://addons on or off, as Project Settings → Plugins does: in the running editor, or in project.godot when no editor runs, so that the editor loads it when it starts. Plugins add tools to the editor, such as a test runner; their autoloads and custom node types come with them.',
    inputSchema: pluginSetEnabledInput,
    annotations: changingAnnotations({ destructive: false, idempotent: true }),
    alwaysLoad: false,
  };

  constructor(private readonly plugins: PluginSwitcher) {}

  async execute(input: z.input<typeof pluginSetEnabledInput>): Promise<CallToolResult> {
    const parsedInput = pluginSetEnabledInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    try {
      return textResult(describeSwitch(await this.plugins.setEnabled(parsedInput.data.plugin, parsedInput.data.enabled)));
    } catch (error) {
      return describeFailure(error);
    }
  }
}

const testInstallFrameworkInput = z.object({
  framework: z.enum(['gut', 'gdunit4']).default('gut').describe('gut (default) installs GUT, gdunit4 installs gdUnit4.'),
});

export class TestInstallFrameworkTool implements Tool<typeof testInstallFrameworkInput> {
  readonly name = 'test_install_framework';

  readonly definition: ToolDefinition<typeof testInstallFrameworkInput> = {
    title: 'Install test framework',
    description:
      "Install a test framework into the project and enable its plugin, so that test_run can run the project's tests: GUT 9.7.1 (default) or gdUnit4 6.2.2, each pinned to the commit of its release and fetched from GitHub with git. It downloads code, so the user confirms every call.",
    inputSchema: testInstallFrameworkInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    alwaysLoad: false,
    requiresUserInteraction: true,
  };

  constructor(private readonly installer: FrameworkInstaller) {}

  async execute(input: z.input<typeof testInstallFrameworkInput>): Promise<CallToolResult> {
    const parsedInput = testInstallFrameworkInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    try {
      return textResult(describeInstallation(await this.installer.install(parsedInput.data.framework)));
    } catch (error) {
      return describeFailure(error);
    }
  }
}

function describeSwitch(switched: SwitchedPlugin): string {
  return [describeState(switched), ...describeAutoloadsLeft(switched.autoloadsLeft)].join('\n');
}

function describeState(switched: SwitchedPlugin): string {
  const state = switched.enabled ? 'on' : 'off';
  if (!switched.changed) {
    return `The plugin ${switched.plugin} is ${state} already.`;
  }
  return switched.through === 'editor'
    ? `Turned the plugin ${switched.plugin} ${state} in the editor.`
    : `Turned the plugin ${switched.plugin} ${state} in project.godot; the editor ${switched.enabled ? 'loads' : 'leaves'} it when it starts.`;
}

function describeAutoloadsLeft(autoloads: readonly PluginAutoload[]): string[] {
  if (autoloads.length === 0) {
    return [];
  }
  const listed = autoloads.map((autoload) => `${autoload.name} (${autoload.path})`);
  const names = listed.length === 1 ? (listed[0] ?? '') : `${listed.slice(0, -1).join(', ')} and ${listed.at(-1) ?? ''}`;
  const [noun, verb, pronoun] = autoloads.length === 1 ? ['autoload', 'is', 'it'] : ['autoloads', 'are', 'them'];
  return [`Its ${noun} ${names} ${verb} still in project.godot, so the game still loads ${pronoun}; remove ${pronoun} with autoload_remove if the game no longer needs ${pronoun}.`];
}

function describeInstallation(installed: InstalledFramework): string {
  const { framework, path, downloaded, plugin } = installed;
  const version = framework.release.tag.replace(/^v/, '');
  const fetched = downloaded
    ? `Installed ${framework.name} ${version} (commit ${framework.release.commit.slice(0, 7)} of ${framework.release.repository.replace(/\.git$/, '')}) into ${path}.`
    : `${framework.name} is installed in ${path} already.`;
  return [fetched, describeSwitch(plugin), `Write tests as scripts in res://test/ that extend ${framework.release.testBase}, such as res://test/test_player.gd, and run them with test_run.`].join('\n');
}

function describeFailure(error: unknown): CallToolResult {
  if (error instanceof PluginSwitchError || error instanceof TestFrameworkInstallError) {
    return errorResult(error.message);
  }
  if (error instanceof EditorUnavailableError || error instanceof BridgeRequestError || error instanceof BridgeConnectionError || error instanceof BridgeProtocolError) {
    return describeRequestFailure(error);
  }
  throw error;
}
