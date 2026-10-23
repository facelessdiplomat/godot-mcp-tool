import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAddonVersion } from '../src/addon/InstalledAddon.js';
import { SERVER_VERSION } from '../src/serverInfo.js';

const serverDirectory = join(import.meta.dirname, '..');
const repositoryRoot = join(serverDirectory, '..');
const addonDirectory = join(repositoryRoot, 'addon', 'addons', 'godot_mcp_tool');
const pluginDirectory = join(repositoryRoot, 'plugin');
const packageVersion = (JSON.parse(readFileSync(join(serverDirectory, 'package.json'), 'utf8')) as { readonly version: string }).version;

function startedPackageVersions(configurationFile: string): (string | undefined)[] {
  return [...readFileSync(configurationFile, 'utf8').matchAll(/godot-mcp-tool@(?<version>[^"\s]+)/g)].map((match) => match.groups?.['version']);
}

describe('the version of the package', () => {
  it('is the same in package.json, the server, plugin.cfg and the addon', () => {
    const addonInfoVersion = /const ADDON_VERSION := "(?<version>[^"]+)"/.exec(readFileSync(join(addonDirectory, 'addon_info.gd'), 'utf8'))?.groups?.['version'];

    expect({ server: SERVER_VERSION, pluginConfig: readAddonVersion(addonDirectory), addonInfo: addonInfoVersion }).toEqual({
      server: packageVersion,
      pluginConfig: packageVersion,
      addonInfo: packageVersion,
    });
  });

  it('is the version of the Claude Code plugin and of the package that its server and hook start', () => {
    const pluginManifest = JSON.parse(readFileSync(join(pluginDirectory, '.claude-plugin', 'plugin.json'), 'utf8')) as { readonly version: string };

    expect({
      plugin: pluginManifest.version,
      server: startedPackageVersions(join(pluginDirectory, '.mcp.json')),
      hook: startedPackageVersions(join(pluginDirectory, 'hooks', 'hooks.json')),
    }).toEqual({ plugin: packageVersion, server: [packageVersion], hook: [packageVersion] });
  });
});
