import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorStatus } from '../../src/bridge/EditorConnection.js';
import type { DiscoveryResult } from '../../src/bridge/DiscoveryFileReader.js';
import { type Clock, EditorLaunchError, EditorLauncher, type EditorLaunchDependencies } from '../../src/editor/EditorLauncher.js';
import type { DetachedLauncher, DetachedProcess } from '../../src/process/DetachedLauncher.js';

const hello = { protocol: 1, godotVersion: '4.8.beta', addonVersion: '0.1.0', projectPath: '/game', executablePath: '/opt/godot', methods: [] };
const notRunning: EditorStatus = { connected: false, reason: 'The Godot editor is not running for this project.' };
const connected: EditorStatus = { connected: true, hello };

class FakeProcess implements DetachedProcess {
  readonly pid = 4321;

  constructor(private readonly launcher: FakeLauncher) {}

  get endReason(): string | undefined {
    return this.launcher.endReason;
  }
}

class FakeLauncher implements DetachedLauncher {
  readonly starts: { readonly command: string; readonly args: readonly string[]; readonly logPath: string }[] = [];
  endReason: string | undefined;

  start(command: string, args: readonly string[], logPath: string): DetachedProcess {
    this.starts.push({ command, args, logPath });
    return new FakeProcess(this);
  }
}

class FakeClock implements Clock {
  current = 0;

  now(): number {
    return this.current;
  }

  sleep(milliseconds: number): Promise<void> {
    this.current += milliseconds;
    return Promise.resolve();
  }
}

describe('EditorLauncher', () => {
  let projectRoot = '';
  let statuses: EditorStatus[] = [];
  let discovery: DiscoveryResult;
  let launcher: FakeLauncher;
  let clock: FakeClock;

  function editorLauncher(overrides: Partial<EditorLaunchDependencies> = {}): EditorLauncher {
    return new EditorLauncher({
      projectRoot,
      editor: { status: () => Promise.resolve(statuses.length > 1 ? (statuses.shift() ?? notRunning) : (statuses[0] ?? notRunning)) },
      readDiscovery: () => discovery,
      locateBinary: () => ({ found: true, path: '/opt/godot/godot', source: 'GODOT_BIN' }),
      launcher,
      clock,
      ...overrides,
    });
  }

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'editor-launcher-')));
    statuses = [notRunning];
    discovery = { kind: 'missing', path: join(projectRoot, '.godot', 'godot_mcp_tool', 'bridge.json') };
    launcher = new FakeLauncher();
    clock = new FakeClock();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('starts the editor for the project and waits until the plugin connects', async () => {
    statuses = [notRunning, notRunning, notRunning, connected];

    const launched = await editorLauncher().launch({ headless: false });

    expect(launcher.starts).toEqual([
      { command: '/opt/godot/godot', args: ['--editor', '--path', projectRoot], logPath: join(projectRoot, '.godot', 'godot_mcp_tool', 'editor.log') },
    ]);
    expect(launched).toEqual({ kind: 'started', hello, pid: 4321, waitedMs: 1000, logPath: join(projectRoot, '.godot', 'godot_mcp_tool', 'editor.log') });
  });

  it('starts a headless editor on request', async () => {
    statuses = [notRunning, connected];

    await editorLauncher().launch({ headless: true });

    expect(launcher.starts[0]?.args).toEqual(['--editor', '--path', projectRoot, '--headless']);
  });

  it('does nothing when the editor is already connected', async () => {
    statuses = [connected];

    const launched = await editorLauncher().launch({ headless: false });

    expect(launched).toEqual({ kind: 'already running', hello });
    expect(launcher.starts).toHaveLength(0);
  });

  it('does not start a second editor next to one that does not answer', async () => {
    discovery = {
      kind: 'found',
      endpoint: { protocol: 1, port: 5000, token: 't', pid: 777, godotVersion: '4.8', addonVersion: '0.1.0', projectPath: projectRoot, executablePath: '/opt/godot', lspPort: 6005, dapPort: 6006, startedAt: '' },
    };

    await expect(editorLauncher().launch({ headless: false })).rejects.toThrow('process 777');
    expect(launcher.starts).toHaveLength(0);
  });

  it('shows the end of the log when the editor exits before the plugin connects', async () => {
    mkdirSync(join(projectRoot, '.godot', 'godot_mcp_tool'), { recursive: true });
    launcher.endReason = 'exit code 1';
    const launching = editorLauncher({
      launcher: {
        start: (command, args, logPath) => {
          writeFileSync(logPath, 'Godot Engine v4.8\nERROR: Invalid project path.\n');
          return launcher.start(command, args, logPath);
        },
      },
    }).launch({ headless: false });

    await expect(launching).rejects.toThrow(EditorLaunchError);
    await expect(launching).rejects.toThrow('ERROR: Invalid project path.');
  });

  it('names the plugin when the editor never connects', async () => {
    await expect(editorLauncher().launch({ headless: false })).rejects.toThrow('"Godot MCP Tool" plugin did not connect');
  });

  it('needs a project and a Godot executable', async () => {
    await expect(editorLauncher({ projectRoot: undefined }).launch({ headless: false })).rejects.toThrow('GODOT_PROJECT_PATH');
    await expect(editorLauncher({ locateBinary: () => ({ found: false, reason: 'No Godot executable was found.' }) }).launch({ headless: false })).rejects.toThrow(
      'No Godot executable was found.',
    );
  });
});
