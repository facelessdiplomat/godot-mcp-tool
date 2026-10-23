import { cpSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const addonSource = join(serverDirectory, '..', 'addon', 'addons', 'godot_mcp_tool');
const bundledAddon = join(serverDirectory, 'addon', 'godot_mcp_tool');
const filesLeftOut = new Set(['.DS_Store']);

rmSync(bundledAddon, { recursive: true, force: true });
cpSync(addonSource, bundledAddon, { recursive: true, filter: (path) => !filesLeftOut.has(basename(path)) });
