import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAutoloadNames } from '../../src/project/ProjectFile.js';

describe('readAutoloadNames', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'project-file-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the names in the autoload section', () => {
    writeFileSync(
      join(root, 'project.godot'),
      [
        'config_version=5',
        '',
        '[application]',
        '',
        'config/name="Arena"',
        '',
        '[autoload]',
        '',
        'GodotMcpRuntime="*res://addons/godot_mcp_tool/runtime/runtime_agent.gd"',
        'GameState="*uid://b3x8k2j4q1v5"',
        '',
        '[editor_plugins]',
        '',
        'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg")',
        '',
      ].join('\n'),
    );

    expect(readAutoloadNames(root)).toEqual(['GodotMcpRuntime', 'GameState']);
  });

  it('finds none without the section or the file', () => {
    expect(readAutoloadNames(root)).toEqual([]);
    writeFileSync(join(root, 'project.godot'), 'config_version=5\n');
    expect(readAutoloadNames(root)).toEqual([]);
  });
});
