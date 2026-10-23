import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddonInstaller } from '../../src/addon/AddonInstaller.js';

const enabledPluginLine = 'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg")';

function writeAddon(directory: string, version: string, files: Readonly<Record<string, string>> = {}): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'plugin.cfg'), ['[plugin]', '', 'name="Godot MCP Tool"', `version="${version}"`, 'script="plugin.gd"', ''].join('\n'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(directory, file, '..'), { recursive: true });
    writeFileSync(join(directory, file), content);
  }
}

describe('installing and updating the addon', () => {
  let workspace: string;
  let bundleDirectory: string;
  let projectRoot: string;
  let addonPath: string;
  let editorRunning: boolean;
  let installer: AddonInstaller;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'addon-installer-'));
    bundleDirectory = join(workspace, 'package', 'addon', 'godot_mcp_tool');
    writeAddon(bundleDirectory, '0.2.0', { 'plugin.gd': 'extends EditorPlugin\n', 'bridge/bridge_server.gd': 'extends RefCounted\n', '.DS_Store': 'finder' });
    projectRoot = join(workspace, 'game');
    mkdirSync(projectRoot);
    writeFileSync(join(projectRoot, 'project.godot'), ['config_version=5', '', '[application]', '', 'config/name="Game"', ''].join('\n'));
    addonPath = join(projectRoot, 'addons', 'godot_mcp_tool');
    editorRunning = false;
    installer = new AddonInstaller({ bundle: { directory: bundleDirectory, version: '0.2.0' }, isEditorRunning: () => editorRunning });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function projectSettings(): string {
    return readFileSync(join(projectRoot, 'project.godot'), 'utf8');
  }

  it('copies the addon into the project and enables its plugin', () => {
    const report = installer.install(projectRoot);

    expect(report).toEqual({
      succeeded: true,
      lines: [
        `Installed the Godot MCP Tool addon 0.2.0 in ${addonPath}.`,
        `Enabled the plugin in ${join(projectRoot, 'project.godot')}.`,
        'Next: open the project in the Godot editor, or restart the editor if it is open. Check the setup with: npx godot-mcp-tool doctor',
      ],
    });
    expect(readFileSync(join(addonPath, 'bridge', 'bridge_server.gd'), 'utf8')).toBe('extends RefCounted\n');
    expect(existsSync(join(addonPath, '.DS_Store'))).toBe(false);
    expect(projectSettings()).toContain(enabledPluginLine);
  });

  it('only enables the plugin when the same version is installed already', () => {
    writeAddon(addonPath, '0.2.0');

    const report = installer.install(projectRoot);

    expect(report).toEqual({
      succeeded: true,
      lines: [`The addon 0.2.0 is installed in ${addonPath} already.`, `Enabled the plugin in ${join(projectRoot, 'project.godot')}.`],
    });
    expect(existsSync(join(addonPath, 'plugin.gd'))).toBe(false);
  });

  it('leaves another installed version to update-addon', () => {
    writeAddon(addonPath, '0.1.0');

    const report = installer.install(projectRoot);

    expect(report).toEqual({
      succeeded: false,
      lines: [`The addon 0.1.0 is installed in ${addonPath} already. To replace it with 0.2.0, run: npx godot-mcp-tool update-addon`],
    });
    expect(existsSync(join(addonPath, 'plugin.gd'))).toBe(false);
    expect(projectSettings()).not.toContain(enabledPluginLine);
  });

  it('leaves a linked addon as it is', () => {
    const checkout = join(workspace, 'checkout', 'godot_mcp_tool');
    writeAddon(checkout, '0.3.0');
    mkdirSync(join(projectRoot, 'addons'));
    symlinkSync(checkout, addonPath, 'junction');

    expect(installer.install(projectRoot)).toEqual({ succeeded: false, lines: [`${addonPath} is a link to ${checkout}, so this command leaves it as it is.`] });
    expect(installer.update(projectRoot)).toEqual({ succeeded: false, lines: [`${addonPath} is a link to ${checkout}, so this command leaves it as it is.`] });
    expect(lstatSync(addonPath).isSymbolicLink()).toBe(true);
  });

  it('replaces an older addon with the version of this package', () => {
    writeAddon(addonPath, '0.1.0', { 'old_command.gd': 'extends RefCounted\n' });

    const report = installer.update(projectRoot);

    expect(report).toEqual({
      succeeded: true,
      lines: [`Updated the addon in ${addonPath} from 0.1.0 to 0.2.0.`, 'Open the project in the Godot editor to load it.'],
    });
    expect(existsSync(join(addonPath, 'old_command.gd'))).toBe(false);
    expect(existsSync(join(addonPath, 'bridge', 'bridge_server.gd'))).toBe(true);
    expect(existsSync(join(projectRoot, 'addons', '.godot_mcp_tool.previous'))).toBe(false);
  });

  it('replaces an incomplete addon', () => {
    mkdirSync(addonPath, { recursive: true });

    const report = installer.update(projectRoot);

    expect(report.succeeded).toBe(true);
    expect(report.lines[0]).toBe(`Replaced the incomplete addon in ${addonPath} with version 0.2.0.`);
    expect(existsSync(join(addonPath, 'plugin.gd'))).toBe(true);
  });

  it('waits until the editor of the project is closed', () => {
    writeAddon(addonPath, '0.1.0');
    editorRunning = true;

    const report = installer.update(projectRoot);

    expect(report).toEqual({ succeeded: false, lines: [`Close the Godot editor of ${projectRoot} first: it runs the addon that update-addon replaces.`] });
    expect(existsSync(join(addonPath, 'plugin.gd'))).toBe(false);
  });

  it('says when the addon is up to date', () => {
    writeAddon(addonPath, '0.2.0');
    editorRunning = true;

    expect(installer.update(projectRoot)).toEqual({ succeeded: true, lines: [`The addon in ${addonPath} is version 0.2.0 already.`] });
  });

  it('keeps an addon that is newer than this package', () => {
    writeAddon(addonPath, '0.10.0');

    expect(installer.update(projectRoot)).toEqual({
      succeeded: false,
      lines: [`The addon in ${addonPath} is version 0.10.0, newer than this package (0.2.0). Run the latest package instead: npx godot-mcp-tool@latest update-addon`],
    });
  });

  it('points to install-addon when there is nothing to update', () => {
    expect(installer.update(projectRoot)).toEqual({
      succeeded: false,
      lines: [`The addon is not installed in ${projectRoot}. Install it with: npx godot-mcp-tool install-addon`],
    });
  });
});
