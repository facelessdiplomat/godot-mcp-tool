import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import type { BinaryLookup } from '../../src/godot/GodotBinaryLocator.js';
import { LocalGameGateway, type LocalGameOptions } from '../../src/runtime/LocalGameGateway.js';
import { FakeGameClient } from '../support/FakeGameClient.js';
import { FakeProcessLauncher } from '../support/FakeProcessLauncher.js';

const godotBinary: BinaryLookup = { found: true, path: '/opt/godot/godot', source: 'GODOT_BIN' };

function logFileFrom(args: readonly string[]): string {
  const argument = args.find((candidate) => candidate.startsWith('--mcp-log-file='));
  if (argument === undefined) {
    throw new Error('The game was launched without a log file');
  }
  return argument.slice('--mcp-log-file='.length);
}

function portFrom(args: readonly string[]): number {
  return Number(args.find((candidate) => candidate.startsWith('--mcp-port='))?.slice('--mcp-port='.length));
}

function writeRecords(path: string, records: readonly unknown[]): void {
  writeFileSync(path, records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}

describe('LocalGameGateway', () => {
  let projectRoot: string;
  let launcher: FakeProcessLauncher;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'local-game-'));
    mkdirSync(join(projectRoot, '.godot'));
    launcher = new FakeProcessLauncher();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function gateway(overrides: Partial<LocalGameOptions> = {}): LocalGameGateway {
    return new LocalGameGateway({
      projectRoot,
      locateBinary: () => godotBinary,
      launcher,
      headless: false,
      startupTimeoutMs: 2_000,
      pollIntervalMs: 5,
      ...overrides,
    });
  }

  function readyGame(output: readonly string[]): (process: unknown, args: readonly string[]) => void {
    return (_process, args) => {
      writeRecords(logFileFrom(args), [
        ...output.map((message) => ({ type: 'log', entry: { level: 'info', message } })),
        { type: 'ready', scene: 'res://main.tscn' },
      ]);
    };
  }

  it('runs the main scene with a log file and returns its first output', async () => {
    launcher.simulate = readyGame(['Arena loaded']);

    const run = await gateway().request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    expect(run).toMatchObject({
      scene: 'res://main.tscn',
      outcome: 'ready',
      state: 'running',
      output: [{ seq: 1, source: 'game', level: 'info', message: 'Arena loaded' }],
      more_output: false,
      next_after: 1,
      saved_scenes: [],
      saved_scripts: [],
    });
    expect(launcher.calls[0]?.command).toBe('/opt/godot/godot');
    expect(launcher.calls[0]?.args).toEqual([
      '--path',
      projectRoot,
      '--',
      `--mcp-log-file=${join(projectRoot, '.godot', 'godot_mcp_tool', 'local_game.ndjson')}`,
      expect.stringMatching(/^--mcp-port=\d+$/) as unknown,
    ]);
    expect(launcher.calls[0]?.environment['GODOT_MCP_GAME_TOKEN']).toMatch(/^[\w-]{20,}$/);
    expect(launcher.calls[0]?.workingDirectory).toBe(projectRoot);
  });

  it('runs with a fixed frame rate on request', async () => {
    launcher.simulate = readyGame([]);

    await gateway().request('game.run', { scene: 'main', watch_ms: 0, stop_after: false, fixed_fps: 60 });

    expect(launcher.calls[0]?.args.slice(0, 6)).toEqual(['--path', projectRoot, '--fixed-fps', '60', '--', `--mcp-log-file=${join(projectRoot, '.godot', 'godot_mcp_tool', 'local_game.ndjson')}`]);
  });

  it('runs a given scene, without a window when asked', async () => {
    launcher.simulate = readyGame([]);
    mkdirSync(join(projectRoot, 'levels'));
    writeFileSync(join(projectRoot, 'levels', 'arena.tscn'), '[gd_scene format=3]\n');

    await gateway({ headless: true }).request('game.run', { scene: 'res://levels/arena.tscn', watch_ms: 0, stop_after: false });

    expect(launcher.calls[0]?.args.slice(0, 4)).toEqual(['--path', projectRoot, '--headless', 'res://levels/arena.tscn']);
  });

  it('reports a game that exits before it is ready with its last output', async () => {
    launcher.simulate = (process) => {
      (process as { emitOutput(text: string): void }).emitOutput('ERROR: Failed to load the main scene.\n');
      (process as { exit(code: number): void }).exit(1);
    };

    const run = await gateway().request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    expect(run).toMatchObject({ outcome: 'stopped', state: 'stopped', scene: 'the main scene' });
    const [entry] = (run as { output: { level: string; source: string; message: string }[] }).output;
    expect(entry?.level).toBe('error');
    expect(entry?.source).toBe('process');
    expect(entry?.message).toContain('exited with code 1');
    expect(entry?.message).toContain('ERROR: Failed to load the main scene.');
  });

  it('stops the game after watching it when asked', async () => {
    launcher.simulate = readyGame([]);

    const run = await gateway().request('game.run', { scene: 'main', watch_ms: 10, stop_after: true });

    expect(run).toMatchObject({ outcome: 'ready', state: 'stopped' });
    expect(launcher.processes[0]?.stopRequests).toBe(1);
  });

  it('stops the previous game before running another one', async () => {
    launcher.simulate = readyGame([]);
    const local = gateway();

    await local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });
    await local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    expect(launcher.processes[0]?.hasExited).toBe(true);
    expect(local.isRunning).toBe(true);
  });

  it('gives up waiting for a game that never gets ready', async () => {
    const run = await gateway({ startupTimeoutMs: 30 }).request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    expect(run).toMatchObject({ outcome: 'timeout', state: 'starting' });
  });

  it('reads the output of the current run after a cursor', async () => {
    launcher.simulate = readyGame(['one', 'two']);
    const local = gateway();
    await local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    const page = await local.request('game.get_output', { after: 1, limit: 100 });

    expect(page).toMatchObject({ entries: [{ seq: 2, message: 'two' }], more: false, next_after: 2, skipped: 0, state: 'running' });
  });

  it('stops the game once', async () => {
    launcher.simulate = readyGame([]);
    const local = gateway();
    await local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    await expect(local.request('game.stop', {})).resolves.toEqual({ was_running: true });
    await expect(local.request('game.stop', {})).resolves.toEqual({ was_running: false });
  });

  it('asks the game for its nodes over its connection to the server', async () => {
    const games: FakeGameClient[] = [];
    launcher.simulate = (process, args, environment) => {
      readyGame([])(process, args);
      void FakeGameClient.connect(portFrom(args), environment['GODOT_MCP_GAME_TOKEN'] ?? '', (request) => ({ id: request.id, result: { asked: request.method, params: request.params } })).then((game) => games.push(game));
    };
    const local = gateway();
    await local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    const properties = await local.request('game.get_properties', { path: 'Player', names: ['velocity'] });
    const waited = await local.request('game.wait', { physics_frames: 10 }, { timeoutMs: 2000 });

    expect(properties).toEqual({ asked: 'properties.get', params: { path: 'Player', names: ['velocity'] } });
    expect(waited).toEqual({ asked: 'wait', params: { physics_frames: 10 } });
    for (const game of games) {
      game.quit();
    }
  });

  it('evaluates expressions only when the project allows unsafe tools', async () => {
    launcher.simulate = (process, args, environment) => {
      readyGame([])(process, args);
      void FakeGameClient.connect(portFrom(args), environment['GODOT_MCP_GAME_TOKEN'] ?? '', (request) => ({ id: request.id, result: { value: 2 } }));
    };
    const local = gateway();
    await local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    const refused = await local.request('game.eval', { expression: '1 + 1' }).catch((error: unknown) => error);
    mkdirSync(join(projectRoot, '.godot', 'editor'), { recursive: true });
    writeFileSync(join(projectRoot, '.godot', 'editor', 'project_metadata.cfg'), '[godot_mcp_tool]\n\nallow_unsafe_tools=true\n');
    const evaluated = await local.request('game.eval', { expression: '1 + 1' });

    expect(refused).toMatchObject({ code: -32009, message: 'Unsafe tools are turned off in the editor for this project' });
    expect(evaluated).toEqual({ value: 2 });
    await local.request('game.stop', {});
  });

  it('explains that a game which is not running cannot be asked', async () => {
    await expect(gateway().request('game.get_tree', {})).rejects.toMatchObject({ code: -32006, message: 'The game is not running' });
  });

  it('cannot run the current scene without the editor', async () => {
    await expect(gateway().request('game.run', { scene: 'current', watch_ms: 0, stop_after: false })).rejects.toMatchObject({
      code: -32005,
    });
  });

  it('explains a missing Godot binary', async () => {
    const local = gateway({ locateBinary: () => ({ found: false, reason: 'Set GODOT_BIN.' }) });

    const request = local.request('game.run', { scene: 'main', watch_ms: 0, stop_after: false });

    await expect(request).rejects.toBeInstanceOf(BridgeRequestError);
    await expect(request).rejects.toMatchObject({ hint: expect.stringContaining('Set GODOT_BIN.') as unknown });
  });

  it('explains a scene that does not exist', async () => {
    await expect(gateway().request('game.run', { scene: 'res://levels/missing.tscn', watch_ms: 0, stop_after: false })).rejects.toMatchObject({
      code: -32004,
    });
  });

  it('explains a missing project', async () => {
    await expect(gateway({ projectRoot: undefined }).request('game.run', { scene: 'main', watch_ms: 0, stop_after: false })).rejects.toBeInstanceOf(
      BridgeRequestError,
    );
  });
});
