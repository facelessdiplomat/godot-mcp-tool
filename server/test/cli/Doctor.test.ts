import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HelloResult } from '../../src/bridge/BridgeClient.js';
import type { EditorStatus } from '../../src/bridge/EditorConnection.js';
import { Doctor, type DoctorDependencies } from '../../src/cli/Doctor.js';
import type { BinaryLookup } from '../../src/godot/GodotBinaryLocator.js';
import { GodotVersion } from '../../src/godot/GodotVersion.js';

const godotVersion = '4.8.beta.custom_build.679066724';

function hello(addonVersion: string): HelloResult {
  return { protocol: 1, godotVersion, addonVersion, projectPath: '/projects/game', executablePath: '/opt/godot/godot', methods: ['hello', 'ping'] };
}

describe('the doctor command', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'doctor-'));
    writeFileSync(join(projectRoot, 'project.godot'), ['config_version=5', ''].join('\n'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function installAddon(version: string): void {
    mkdirSync(join(projectRoot, 'addons', 'godot_mcp_tool'), { recursive: true });
    writeFileSync(join(projectRoot, 'addons', 'godot_mcp_tool', 'plugin.cfg'), ['[plugin]', '', `version="${version}"`, ''].join('\n'));
  }

  function enablePlugin(): void {
    writeFileSync(
      join(projectRoot, 'project.godot'),
      ['config_version=5', '', '[editor_plugins]', '', 'enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg")', ''].join('\n'),
    );
  }

  function doctor(overrides: Partial<DoctorDependencies> = {}): Doctor {
    const editorStatus: EditorStatus = { connected: true, hello: hello('0.2.0') };
    return new Doctor({
      nodeVersion: '22.12.0',
      packageVersion: '0.2.0',
      project: { found: true, root: projectRoot, source: 'working directory' },
      editor: { status: () => Promise.resolve(editorStatus) },
      binaryLocator: {
        locate: (runningEditorExecutable?: string): BinaryLookup =>
          runningEditorExecutable === undefined ? { found: true, path: '/usr/bin/godot', source: 'PATH' } : { found: true, path: runningEditorExecutable, source: 'running editor' },
      },
      readVersion: () => Promise.resolve(GodotVersion.parse(godotVersion)),
      ...overrides,
    });
  }

  it('reports a complete setup', async () => {
    installAddon('0.2.0');
    enablePlugin();

    const report = await doctor().check();

    expect(report).toEqual({
      succeeded: true,
      lines: [
        'Checking the setup of Godot MCP Tool 0.2.0:',
        'ok       Node.js 22.12.0',
        `ok       Project ${projectRoot} (from working directory)`,
        `ok       Godot ${godotVersion} at /opt/godot/godot (from running editor)`,
        `ok       Addon 0.2.0 in ${join(projectRoot, 'addons', 'godot_mcp_tool')}`,
        `ok       Plugin enabled in ${join(projectRoot, 'project.godot')}`,
        `ok       Editor connected: Godot ${godotVersion}, addon 0.2.0`,
        'Everything is set up.',
      ],
    });
  });

  it('says how to fix what is missing', async () => {
    const report = await doctor({
      editor: { status: () => Promise.resolve({ connected: false, reason: 'The Godot editor of this project was closed.' }) },
    }).check();

    expect(report.succeeded).toBe(false);
    expect(report.lines).toEqual([
      'Checking the setup of Godot MCP Tool 0.2.0:',
      'ok       Node.js 22.12.0',
      `ok       Project ${projectRoot} (from working directory)`,
      `ok       Godot ${godotVersion} at /usr/bin/godot (from PATH)`,
      `problem  Addon not installed in ${join(projectRoot, 'addons', 'godot_mcp_tool')}. Install it with: npx godot-mcp-tool install-addon`,
      `problem  Plugin not enabled in ${join(projectRoot, 'project.godot')}. Enable "Godot MCP Tool" in Project → Project Settings → Plugins.`,
      'warning  Editor not connected. The Godot editor of this project was closed. Open the project in the Godot editor, or ask Claude to start it with editor_launch.',
      '2 problems, 1 warning.',
    ]);
  });

  it('warns about an addon of another version and an editor that still runs an older one', async () => {
    installAddon('0.1.0');
    enablePlugin();

    const report = await doctor({ editor: { status: () => Promise.resolve({ connected: true, hello: hello('0.1.0') }) } }).check();

    expect(report.succeeded).toBe(true);
    expect(report.lines).toContain(
      `warning  Addon 0.1.0 in ${join(projectRoot, 'addons', 'godot_mcp_tool')} differs from this package (0.2.0). Update it with: npx godot-mcp-tool update-addon`,
    );
    expect(report.lines).toContain(`warning  Editor connected, but it runs the addon 0.1.0, not 0.2.0. Restart the editor once the addon is updated.`);
    expect(report.lines.at(-1)).toBe('0 problems, 2 warnings.');
  });

  it('checks Node.js and Godot without a project', async () => {
    const report = await doctor({
      nodeVersion: '20.11.1',
      project: { found: false, reason: 'No project.godot was found in /tmp or its parent folders.' },
      binaryLocator: { locate: (): BinaryLookup => ({ found: false, reason: 'No Godot executable was found. Set GODOT_BIN to the path of the Godot executable.' }) },
    }).check();

    expect(report.lines).toEqual([
      'Checking the setup of Godot MCP Tool 0.2.0:',
      'problem  Node.js 20.11.1 is too old: Godot MCP Tool needs Node.js 22 or newer.',
      'problem  No project.godot was found in /tmp or its parent folders.',
      'problem  No Godot executable was found. Set GODOT_BIN to the path of the Godot executable.',
      '3 problems, 0 warnings.',
    ]);
  });

  it('warns about a Godot version older than the addon needs', async () => {
    installAddon('0.2.0');
    enablePlugin();

    const report = await doctor({ readVersion: () => Promise.resolve(GodotVersion.parse('4.6.2.stable.official.71f334935')) }).check();

    expect(report.lines).toContain('warning  Godot 4.6.2.stable.official.71f334935 at /opt/godot/godot (from running editor) is older than 4.7, which the addon needs.');
  });

  it('reports a Godot executable that does not tell its version', async () => {
    const report = await doctor({ readVersion: () => Promise.reject(new Error('/opt/godot/godot --version failed: exit code 1')) }).check();

    expect(report.lines).toContain('problem  Godot at /opt/godot/godot (from running editor) did not tell its version: /opt/godot/godot --version failed: exit code 1');
  });
});
