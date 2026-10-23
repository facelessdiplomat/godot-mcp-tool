import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAddonVersion } from '../src/addon/InstalledAddon.js';
import { SERVER_VERSION } from '../src/serverInfo.js';

const serverDirectory = join(import.meta.dirname, '..');
const addonDirectory = join(serverDirectory, '..', 'addon', 'addons', 'godot_mcp_tool');

describe('the version of the package', () => {
  it('is the same in package.json, the server, plugin.cfg and the addon', () => {
    const packageVersion = (JSON.parse(readFileSync(join(serverDirectory, 'package.json'), 'utf8')) as { readonly version: string }).version;
    const addonInfoVersion = /const ADDON_VERSION := "(?<version>[^"]+)"/.exec(readFileSync(join(addonDirectory, 'addon_info.gd'), 'utf8'))?.groups?.['version'];

    expect({ server: SERVER_VERSION, pluginConfig: readAddonVersion(addonDirectory), addonInfo: addonInfoVersion }).toEqual({
      server: packageVersion,
      pluginConfig: packageVersion,
      addonInfo: packageVersion,
    });
  });
});
