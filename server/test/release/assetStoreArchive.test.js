import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packAssetStoreArchive } from '../../tools/assetStoreArchive.js';

const endOfCentralDirectory = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function entriesOf(archive) {
  const bytes = readFileSync(archive);
  const end = bytes.lastIndexOf(endOfCentralDirectory);
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    names.push(bytes.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names.filter((name) => !name.endsWith('/')).sort();
}

describe('the archive for the Godot Asset Store', () => {
  let workspace = '';

  function write(path, text) {
    const file = join(workspace, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  function git(...gitArguments) {
    return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...gitArguments], { cwd: workspace, encoding: 'utf8' });
  }

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'asset-store-'));
    git('init', '--quiet');
    write('LICENSE', 'MIT License\n');
    write('server/package.json', '{}\n');
    write('addon/addons/godot_mcp_tool/plugin.cfg', '[plugin]\n\nname="Godot MCP Tool"\nversion="9.8.7"\nscript="plugin.gd"\n');
    write('addon/addons/godot_mcp_tool/plugin.gd', '@tool\nextends EditorPlugin\n');
    write('addon/addons/godot_mcp_tool/plugin.gd.uid', 'uid://b1\n');
    write('addon/addons/godot_mcp_tool/LICENSE', 'MIT License\n');
    write('addon/addons/godot_mcp_tool/README.md', '# Godot MCP Tool\n');
    write('addon/addons/godot_mcp_tool/editor/dock.gd', 'extends Control\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'Addon');
    write('addon/addons/godot_mcp_tool/scratch.gd', 'extends Node\n');
    write('addon/addons/godot_mcp_tool/.DS_Store', '');
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('holds the addon of the commit under addons/godot_mcp_tool and nothing else, named with its version', () => {
    const archive = packAssetStoreArchive({ repositoryRoot: workspace, commit: 'HEAD', outputDirectory: join(workspace, 'out') });

    expect(archive).toBe(join(workspace, 'out', 'godot-mcp-tool-9.8.7-asset-store.zip'));
    expect(entriesOf(archive)).toEqual([
      'addons/godot_mcp_tool/LICENSE',
      'addons/godot_mcp_tool/README.md',
      'addons/godot_mcp_tool/editor/dock.gd',
      'addons/godot_mcp_tool/plugin.cfg',
      'addons/godot_mcp_tool/plugin.gd',
      'addons/godot_mcp_tool/plugin.gd.uid',
    ]);
  });

  it('refuses a commit whose addon has no version', () => {
    write('addon/addons/godot_mcp_tool/plugin.cfg', '[plugin]\n\nname="Godot MCP Tool"\n');
    git('commit', '--quiet', '-am', 'No version');

    expect(() => packAssetStoreArchive({ repositoryRoot: workspace, commit: 'HEAD', outputDirectory: join(workspace, 'out') })).toThrow(
      'addon/addons/godot_mcp_tool/plugin.cfg at HEAD has no version',
    );
  });
});
