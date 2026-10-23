import { lstatSync, readFileSync, readlinkSync, type Stats } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readConfigSections } from '../project/ConfigText.js';

export const addonFolderName = 'godot_mcp_tool';

export type InstalledAddon =
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'installed'; readonly path: string; readonly version: string }
  | { readonly kind: 'linked'; readonly path: string; readonly target: string; readonly version: string | undefined }
  | { readonly kind: 'broken'; readonly path: string; readonly reason: string };

export function addonPathIn(projectRoot: string): string {
  return join(projectRoot, 'addons', addonFolderName);
}

export function inspectInstalledAddon(projectRoot: string): InstalledAddon {
  const path = addonPathIn(projectRoot);
  let entry: Stats;
  try {
    entry = lstatSync(path);
  } catch {
    return { kind: 'missing', path };
  }
  if (entry.isSymbolicLink()) {
    return { kind: 'linked', path, target: resolve(dirname(path), readlinkSync(path)), version: readAddonVersion(path) };
  }
  if (!entry.isDirectory()) {
    return { kind: 'broken', path, reason: 'it is a file, not a folder' };
  }
  const version = readAddonVersion(path);
  return version === undefined ? { kind: 'broken', path, reason: 'it has no plugin.cfg with a version' } : { kind: 'installed', path, version };
}

export function readAddonVersion(addonDirectory: string): string | undefined {
  let pluginConfig: string;
  try {
    pluginConfig = readFileSync(join(addonDirectory, 'plugin.cfg'), 'utf8');
  } catch {
    return undefined;
  }
  return readConfigSections(pluginConfig)
    .find((section) => section.name === 'plugin')
    ?.values.get('version');
}
