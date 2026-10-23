import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { type CommandReport, failed, succeeded } from '../cli/CommandReport.js';
import { addonFolderName, inspectInstalledAddon } from './InstalledAddon.js';
import { withPluginEnabled } from './PluginActivation.js';

export interface AddonBundle {
  readonly directory: string;
  readonly version: string;
}

export interface AddonInstallerDependencies {
  readonly bundle: AddonBundle;
  readonly isEditorRunning: (projectRoot: string) => boolean;
}

const filesLeftOut = new Set(['.DS_Store']);

export class AddonInstaller {
  constructor(private readonly dependencies: AddonInstallerDependencies) {}

  install(projectRoot: string): CommandReport {
    const { bundle } = this.dependencies;
    const installed = inspectInstalledAddon(projectRoot);
    switch (installed.kind) {
      case 'linked':
        return failed(`${installed.path} is a link to ${installed.target}, so this command leaves it as it is.`);
      case 'broken':
        return failed(`${installed.path} is not a complete addon: ${installed.reason}. Replace it with: npx godot-mcp-tool update-addon`);
      case 'installed':
        if (installed.version !== bundle.version) {
          return failed(
            `The addon ${installed.version} is installed in ${installed.path} already. To replace it with ${bundle.version}, run: npx godot-mcp-tool update-addon`,
          );
        }
        return succeeded(`The addon ${installed.version} is installed in ${installed.path} already.`, enablePlugin(projectRoot));
      case 'missing':
        copyAddon(bundle.directory, installed.path);
        return succeeded(
          `Installed the Godot MCP Tool addon ${bundle.version} in ${installed.path}.`,
          enablePlugin(projectRoot),
          'Next: open the project in the Godot editor, or restart the editor if it is open. Check the setup with: npx godot-mcp-tool doctor',
        );
    }
  }

  update(projectRoot: string): CommandReport {
    const { bundle } = this.dependencies;
    const installed = inspectInstalledAddon(projectRoot);
    if (installed.kind === 'missing') {
      return failed(`The addon is not installed in ${projectRoot}. Install it with: npx godot-mcp-tool install-addon`);
    }
    if (installed.kind === 'linked') {
      return failed(`${installed.path} is a link to ${installed.target}, so this command leaves it as it is.`);
    }
    if (installed.kind === 'installed' && installed.version === bundle.version) {
      return succeeded(`The addon in ${installed.path} is version ${bundle.version} already.`);
    }
    if (installed.kind === 'installed' && isNewerVersion(installed.version, bundle.version)) {
      return failed(
        `The addon in ${installed.path} is version ${installed.version}, newer than this package (${bundle.version}). Run the latest package instead: npx godot-mcp-tool@latest update-addon`,
      );
    }
    if (this.dependencies.isEditorRunning(projectRoot)) {
      return failed(`Close the Godot editor of ${projectRoot} first: it runs the addon that update-addon replaces.`);
    }
    replaceAddon(bundle.directory, installed.path);
    return succeeded(
      installed.kind === 'installed'
        ? `Updated the addon in ${installed.path} from ${installed.version} to ${bundle.version}.`
        : `Replaced the incomplete addon in ${installed.path} with version ${bundle.version}.`,
      'Open the project in the Godot editor to load it.',
    );
  }
}

function enablePlugin(projectRoot: string): string {
  const projectFile = join(projectRoot, 'project.godot');
  const settings = readFileSync(projectFile, 'utf8');
  const settingsWithPlugin = withPluginEnabled(settings);
  if (settingsWithPlugin === settings) {
    return `The plugin is enabled in ${projectFile} already.`;
  }
  writeFileSync(projectFile, settingsWithPlugin);
  return `Enabled the plugin in ${projectFile}.`;
}

function copyAddon(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, filter: (path) => !filesLeftOut.has(basename(path)) });
}

function replaceAddon(source: string, destination: string): void {
  const addonsFolder = dirname(destination);
  const incoming = join(addonsFolder, `.${addonFolderName}.incoming`);
  const previous = join(addonsFolder, `.${addonFolderName}.previous`);
  rmSync(incoming, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
  copyAddon(source, incoming);
  renameSync(destination, previous);
  try {
    renameSync(incoming, destination);
  } catch (error) {
    renameSync(previous, destination);
    throw error;
  }
  rmSync(previous, { recursive: true, force: true });
}

function isNewerVersion(candidate: string, reference: string): boolean {
  const candidateParts = versionNumbers(candidate);
  const referenceParts = versionNumbers(reference);
  for (let index = 0; index < Math.max(candidateParts.length, referenceParts.length); index += 1) {
    const difference = (candidateParts[index] ?? 0) - (referenceParts[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
}

function versionNumbers(version: string): number[] {
  return (version.split('-')[0] ?? '').split('.').map((part) => Number.parseInt(part, 10));
}
