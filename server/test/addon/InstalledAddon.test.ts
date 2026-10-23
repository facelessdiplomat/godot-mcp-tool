import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectInstalledAddon, readAddonVersion } from '../../src/addon/InstalledAddon.js';

function writeAddon(directory: string, version: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'plugin.cfg'), ['[plugin]', '', 'name="Godot MCP Tool"', `version="${version}"`, 'script="plugin.gd"', ''].join('\n'));
}

describe('the addon installed in a project', () => {
  let workspace: string;
  let projectRoot: string;
  let addonPath: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'installed-addon-'));
    projectRoot = join(workspace, 'game');
    mkdirSync(projectRoot);
    addonPath = join(projectRoot, 'addons', 'godot_mcp_tool');
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('is missing when the project has no addon folder', () => {
    expect(inspectInstalledAddon(projectRoot)).toEqual({ kind: 'missing', path: addonPath });
  });

  it('has the version from its plugin.cfg', () => {
    writeAddon(addonPath, '0.1.0');

    expect(inspectInstalledAddon(projectRoot)).toEqual({ kind: 'installed', path: addonPath, version: '0.1.0' });
  });

  it('is a link while it is developed in another folder', () => {
    const source = join(workspace, 'checkout', 'godot_mcp_tool');
    writeAddon(source, '0.2.0');
    mkdirSync(join(projectRoot, 'addons'));
    symlinkSync(source, addonPath, 'junction');

    expect(inspectInstalledAddon(projectRoot)).toEqual({ kind: 'linked', path: addonPath, target: source, version: '0.2.0' });
  });

  it('is broken when its folder has no plugin.cfg with a version', () => {
    mkdirSync(addonPath, { recursive: true });

    expect(inspectInstalledAddon(projectRoot)).toEqual({ kind: 'broken', path: addonPath, reason: 'it has no plugin.cfg with a version' });

    writeFileSync(join(addonPath, 'plugin.cfg'), ['[plugin]', '', 'name="Godot MCP Tool"', ''].join('\n'));

    expect(inspectInstalledAddon(projectRoot)).toEqual({ kind: 'broken', path: addonPath, reason: 'it has no plugin.cfg with a version' });
  });

  it('is broken when a file stands in its place', () => {
    mkdirSync(join(projectRoot, 'addons'));
    writeFileSync(addonPath, '');

    expect(inspectInstalledAddon(projectRoot)).toEqual({ kind: 'broken', path: addonPath, reason: 'it is a file, not a folder' });
  });

  it('reads the version of any addon folder', () => {
    const bundled = join(workspace, 'package', 'addon', 'godot_mcp_tool');
    writeAddon(bundled, '0.3.1');

    expect(readAddonVersion(bundled)).toBe('0.3.1');
    expect(readAddonVersion(join(workspace, 'nowhere'))).toBeUndefined();
  });
});
