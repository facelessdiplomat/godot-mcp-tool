import { beforeEach, describe, expect, it } from 'vitest';
import { type DebugAdapterConnection, type DebugAdapterEvent, DebugAdapterRequestError, DebugAdapterUnavailableError } from '../../src/debug/DebugAdapterClient.js';
import { DebugError, GameDebugger, type GameDebuggerDependencies } from '../../src/debug/GameDebugger.js';

const projectPath = '/games/arena';

interface FakeFrame {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

class FakeGodotDebugAdapter implements DebugAdapterConnection {
  readonly requests: { readonly command: string; readonly args: Record<string, unknown> }[] = [];
  readonly breakpoints = new Map<string, number[]>();
  private readonly knownBreakpoints = new Map<string, Set<number>>();
  frames: FakeFrame[] = [];
  stepTo: FakeFrame[] | undefined;
  variablesNotSentYet = 0;
  readonly emitted: string[] = [];
  variablesByScope: Readonly<Record<string, readonly Record<string, unknown>[]>> = {};
  editorPath = projectPath;
  isOpen = true;
  private readonly listeners: ((event: DebugAdapterEvent) => void)[] = [];

  request(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.requests.push({ command, args });
    switch (command) {
      case 'setBreakpoints':
        return this.setBreakpoints(args);
      case 'stackTrace':
        return Promise.resolve({
          stackFrames: this.frames.map((frame, id) => ({ id, name: frame.name, line: frame.line - 1, column: -1, source: { path: `${projectPath}/${frame.file}` } })),
        });
      case 'scopes':
        return Promise.resolve({
          scopes: [
            { name: 'Locals', variablesReference: 1 },
            { name: 'Members', variablesReference: 2 },
            { name: 'Globals', variablesReference: 3 },
          ],
        });
      case 'variables':
        if (this.variablesNotSentYet > 0) {
          this.variablesNotSentYet -= 1;
          return Promise.reject(new DebugAdapterRequestError('An unknown error has occurred when processing the request.', 'unknown', {}));
        }
        return Promise.resolve({ variables: this.variablesByScope[String(args['variablesReference'])] ?? [] });
      case 'next':
      case 'stepIn':
        this.emit('continued', { threadId: 1 });
        setTimeout(() => {
          this.frames = this.stepTo ?? [];
          if (this.stepTo !== undefined) {
            this.emit('stopped', { reason: 'step', threadId: 1 });
          }
        }, 5);
        return Promise.resolve({});
      case 'continue':
        this.frames = [];
        setTimeout(() => {
          this.emit('continued', { threadId: 1 });
        }, 5);
        return Promise.resolve({});
      default:
        return Promise.resolve({});
    }
  }

  onEvent(listener: (event: DebugAdapterEvent) => void): void {
    this.listeners.push(listener);
  }

  close(): void {
    this.isOpen = false;
  }

  stop(reason: string, frames: FakeFrame[], text?: string): void {
    this.frames = frames;
    this.emit('stopped', { reason, threadId: 1, ...(text === undefined ? {} : { text }) });
  }

  emit(event: string, body: Record<string, unknown>): void {
    this.emitted.push(event);
    for (const listener of this.listeners) {
      listener({ event, body });
    }
  }

  private setBreakpoints(args: Record<string, unknown>): Promise<unknown> {
    const source = args['source'] as { name: string; path: string; checksums: unknown[] };
    if (!source.path.startsWith(this.editorPath)) {
      return Promise.reject(new DebugAdapterRequestError('wrong path', 'wrong_path', { clientPath: source.path, editorPath: this.editorPath }));
    }
    const lines = (args['breakpoints'] as { line: number }[]).map((breakpoint) => breakpoint.line + 1);
    const file = `res://${source.path.slice(projectPath.length + 1)}`;
    if (file !== 'res://project.godot') {
      const known = this.knownBreakpoints.get(file) ?? new Set<number>();
      const inTheEditor = new Set(this.breakpoints.get(file) ?? []);
      for (const line of lines) {
        known.add(line);
        inTheEditor.add(line);
      }
      for (const line of [...known].filter((knownLine) => !lines.includes(knownLine))) {
        known.delete(line);
        inTheEditor.delete(line);
      }
      this.knownBreakpoints.set(file, known);
      this.breakpoints.set(
        file,
        [...inTheEditor].sort((first, second) => first - second),
      );
    }
    return Promise.resolve({ breakpoints: lines.map((line) => ({ line, verified: true })) });
  }
}

describe('GameDebugger', () => {
  let adapter: FakeGodotDebugAdapter;
  let connectionAttempts: number[];
  let connected: boolean;

  function gameDebugger(overrides: Partial<GameDebuggerDependencies> = {}): GameDebugger {
    return new GameDebugger({
      editor: {
        request: () => Promise.resolve({ breakpoints: [...adapter.breakpoints].flatMap(([file, lines]) => lines.map((line) => `${file}:${String(line)}`)) }),
      },
      debugAdapter: () => Promise.resolve(connected ? { port: 6006, projectPath } : undefined),
      connect: (port) => {
        connectionAttempts.push(port);
        return Promise.resolve(adapter);
      },
      ...overrides,
    });
  }

  beforeEach(() => {
    adapter = new FakeGodotDebugAdapter();
    connectionAttempts = [];
    connected = true;
  });

  it('checks that the debug adapter belongs to this project before it uses it, and connects once', async () => {
    const debug = gameDebugger();

    await debug.currentStop();
    await debug.currentStop();

    expect(connectionAttempts).toEqual([6006]);
    expect(adapter.requests[0]).toEqual({
      command: 'setBreakpoints',
      args: { source: { name: 'project.godot', path: '/games/arena/project.godot', checksums: [] }, breakpoints: [] },
    });
  });

  it('refuses the debug adapter of another editor and explains the missing editor and port', async () => {
    adapter.editorPath = '/games/racer';
    const refusal = await gameDebugger()
      .currentStop()
      .catch((error: unknown) => error);
    connected = false;
    const missingEditor = await gameDebugger()
      .currentStop()
      .catch((error: unknown) => error);
    connected = true;
    const unreachable = await gameDebugger({ connect: () => Promise.reject(new DebugAdapterUnavailableError('ECONNREFUSED')) })
      .currentStop()
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(DebugError);
    expect((refusal as DebugError).message).toBe(
      'The debug adapter on port 6006 belongs to another Godot editor, which has /games/racer open. Close that editor, or start the editor of this project with --dap-port and set GODOT_DAP_PORT to that port.',
    );
    expect(adapter.isOpen).toBe(false);
    expect((missingEditor as DebugError).message).toContain('The Godot editor is not connected');
    expect((unreachable as DebugError).message).toBe(
      'The debug adapter of the Godot editor is not reachable on port 6006: ECONNREFUSED. The editor listens on the port of its setting network/debug_adapter/remote_port; set GODOT_DAP_PORT when that is another port.',
    );
  });

  it('adds and removes breakpoints per script with lines counted from one, keeping the others', async () => {
    adapter.breakpoints.set('res://enemy.gd', [7]);
    const debug = gameDebugger();

    const breakpoints = await debug.changeBreakpoints({
      add: [
        { file: 'res://player.gd', line: 12 },
        { file: 'res://player.gd', line: 30 },
      ],
      remove: [{ file: 'res://enemy.gd', line: 9 }],
      clearAll: false,
    });

    expect(adapter.requests.slice(1).map((request) => request.args)).toEqual([
      { source: { name: 'enemy.gd', path: '/games/arena/enemy.gd', checksums: [] }, breakpoints: [{ line: 6 }] },
      { source: { name: 'player.gd', path: '/games/arena/player.gd', checksums: [] }, breakpoints: [{ line: 11 }, { line: 29 }] },
    ]);
    expect(breakpoints).toEqual([
      { file: 'res://enemy.gd', line: 7 },
      { file: 'res://player.gd', line: 12 },
      { file: 'res://player.gd', line: 30 },
    ]);
  });

  it('removes the breakpoints that the debug adapter forgot when the game stopped', async () => {
    adapter.breakpoints.set('res://enemy.gd', [7, 9]);

    const breakpoints = await gameDebugger().changeBreakpoints({ add: [], remove: [{ file: 'res://enemy.gd', line: 9 }], clearAll: false });

    expect(adapter.requests.slice(1).map((request) => request.args)).toEqual([
      { source: { name: 'enemy.gd', path: '/games/arena/enemy.gd', checksums: [] }, breakpoints: [{ line: 6 }, { line: 8 }] },
      { source: { name: 'enemy.gd', path: '/games/arena/enemy.gd', checksums: [] }, breakpoints: [{ line: 6 }] },
    ]);
    expect(breakpoints).toEqual([{ file: 'res://enemy.gd', line: 7 }]);
  });

  it('clears every breakpoint of the project', async () => {
    adapter.breakpoints.set('res://enemy.gd', [7]);
    adapter.breakpoints.set('res://player.gd', [12]);

    const breakpoints = await gameDebugger().changeBreakpoints({ add: [], remove: [], clearAll: true });

    expect(breakpoints).toEqual([]);
  });

  it('tells where the game stopped and why, with the stack counted from one', async () => {
    const debug = gameDebugger();
    await debug.currentStop();
    adapter.stop('breakpoint', [
      { file: 'player.gd', line: 12, name: '_physics_process' },
      { file: 'world.gd', line: 40, name: 'tick' },
    ]);

    expect(await debug.currentStop()).toEqual({
      reason: 'breakpoint',
      error: undefined,
      frames: [
        { index: 0, file: 'res://player.gd', line: 12, function: '_physics_process' },
        { index: 1, file: 'res://world.gd', line: 40, function: 'tick' },
      ],
    });
    adapter.stop('exception', [{ file: 'player.gd', line: 20, name: 'jump' }], 'Invalid access to property "y" on a null instance.');
    expect(await debug.currentStop()).toMatchObject({ reason: 'error', error: 'Invalid access to property "y" on a null instance.' });
  });

  it('says the game is not stopped when the stack is empty, and waits for the next stop', async () => {
    const debug = gameDebugger();

    expect(await debug.currentStop()).toBeUndefined();
    expect(await debug.waitForStop(20)).toBeUndefined();
    setTimeout(() => {
      adapter.stop('breakpoint', [{ file: 'player.gd', line: 12, name: '_physics_process' }]);
    }, 10);
    expect(await debug.waitForStop(2000)).toMatchObject({ reason: 'breakpoint', frames: [{ file: 'res://player.gd', line: 12 }] });
  });

  it('reads the locals and members of a frame, without self, and names objects', async () => {
    adapter.variablesByScope = {
      1: [
        { name: 'delta', value: '0.016667', variablesReference: 0 },
        { name: 'target', value: '<EncodedObjectAsID#-9223370404247037664>', variablesReference: 5 },
      ],
      2: [
        { name: 'self', value: '<EncodedObjectAsID#-9223370404247037660>', variablesReference: 4 },
        { name: 'speed', value: '4.5', variablesReference: 0 },
      ],
    };

    const variables = await gameDebugger().variables(1);

    expect(adapter.requests.slice(1)).toEqual([
      { command: 'scopes', args: { frameId: 1 } },
      { command: 'variables', args: { variablesReference: 1 } },
      { command: 'variables', args: { variablesReference: 2 } },
    ]);
    expect(variables).toEqual({
      locals: [
        { name: 'delta', value: '0.016667' },
        { name: 'target', value: '(object)' },
      ],
      members: [{ name: 'speed', value: '4.5' }],
    });
  });

  it('asks again for variables that the game has not sent yet', async () => {
    adapter.variablesByScope = { 1: [{ name: 'doubled', value: '2', variablesReference: 0 }] };
    adapter.variablesNotSentYet = 2;

    const variables = await gameDebugger().variables(0);

    expect(variables.locals).toEqual([{ name: 'doubled', value: '2' }]);
  });

  it('closes its connection when the server shuts down', async () => {
    const debug = gameDebugger();
    await debug.currentStop();

    debug.close();

    expect(adapter.isOpen).toBe(false);
  });

  it('steps to the next line and continues the game', async () => {
    const debug = gameDebugger();
    await debug.currentStop();
    adapter.stop('breakpoint', [{ file: 'player.gd', line: 12, name: '_physics_process' }]);
    adapter.stepTo = [{ file: 'player.gd', line: 13, name: '_physics_process' }];

    const stepped = await debug.resume('step_over', 2000);
    const continued = await debug.resume('continue', 2000);

    expect(stepped).toMatchObject({ reason: 'step', frames: [{ file: 'res://player.gd', line: 13 }] });
    expect(continued).toBeUndefined();
    expect(adapter.emitted.at(-1)).toBe('continued');
    expect(adapter.requests.map((request) => request.command)).toEqual(['setBreakpoints', 'stackTrace', 'stackTrace', 'next', 'stackTrace', 'stackTrace', 'continue']);
    await expect(debug.resume('step_into', 2000)).rejects.toThrow('The game is not stopped in the debugger');
  });
});
