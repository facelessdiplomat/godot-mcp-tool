import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as z from 'zod/v4';
import type { DebugAdapterAddress } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { type DebugAdapterConnection, type DebugAdapterEvent, DebugAdapterRequestError } from './DebugAdapterClient.js';

export interface SourceLine {
  readonly file: string;
  readonly line: number;
}

export type StopReason = 'breakpoint' | 'step' | 'error' | 'pause' | 'unknown';

export interface StackFrame {
  readonly index: number;
  readonly file: string;
  readonly line: number;
  readonly function: string;
}

export interface GameStop {
  readonly reason: StopReason;
  readonly error: string | undefined;
  readonly frames: readonly StackFrame[];
}

export interface DebugVariable {
  readonly name: string;
  readonly value: string;
}

export interface FrameVariables {
  readonly locals: readonly DebugVariable[];
  readonly members: readonly DebugVariable[];
}

export interface BreakpointChange {
  readonly add: readonly SourceLine[];
  readonly remove: readonly SourceLine[];
  readonly clearAll: boolean;
}

export type ResumeAction = 'continue' | 'step_over' | 'step_into';

export interface GameDebuggerDependencies {
  readonly editor: EditorGateway;
  readonly debugAdapter: () => Promise<DebugAdapterAddress | undefined>;
  readonly connect: (port: number) => Promise<DebugAdapterConnection>;
}

export class DebugError extends Error {
  override readonly name = 'DebugError';
}

interface StopEvent {
  readonly reason: StopReason;
  readonly error: string | undefined;
}

interface EventWaiter {
  readonly event: string;
  readonly resolve: (body: Record<string, unknown>) => void;
}

const resourcePrefix = 'res://';
const mainThread = { threadId: 1 };
const objectValuePattern = /^<EncodedObjectAsID#-?\d+>$/;
const variablesAttempts = 20;
const variablesRetryDelayMs = 50;
const variablesNotReceivedCode = 'unknown';
const resumeTimeoutMs = 2_000;
const stepCommands: Readonly<Record<Exclude<ResumeAction, 'continue'>, string>> = { step_over: 'next', step_into: 'stepIn' };
const stopReasons: Readonly<Record<string, StopReason>> = { breakpoint: 'breakpoint', step: 'step', exception: 'error', paused: 'pause' };

const editorBreakpointsSchema = z.object({ breakpoints: z.array(z.string()) });
const stackTraceSchema = z.object({
  stackFrames: z.array(z.object({ id: z.number(), name: z.string(), line: z.number(), source: z.object({ path: z.string() }) })),
});
const scopesSchema = z.object({ scopes: z.array(z.object({ name: z.string(), variablesReference: z.number() })) });
const variablesSchema = z.object({ variables: z.array(z.object({ name: z.string(), value: z.string() })) });

export class GameDebugger {
  private openConnection: DebugAdapterConnection | undefined;
  private connecting: Promise<DebugAdapterConnection> | undefined;
  private projectPath = '';
  private lastStop: StopEvent | undefined;
  private eventWaiters: EventWaiter[] = [];

  constructor(private readonly dependencies: GameDebuggerDependencies) {}

  async breakpoints(): Promise<SourceLine[]> {
    const response = editorBreakpointsSchema.parse(await this.dependencies.editor.request('editor.breakpoints', {}));
    return response.breakpoints.map(sourceLineOf).sort(compareSourceLines);
  }

  async changeBreakpoints(change: BreakpointChange): Promise<SourceLine[]> {
    const currentLinesByFile = new Map<string, number[]>();
    for (const breakpoint of await this.breakpoints()) {
      currentLinesByFile.set(breakpoint.file, [...(currentLinesByFile.get(breakpoint.file) ?? []), breakpoint.line]);
    }
    const linesByFile = new Map([...currentLinesByFile].map(([file, lines]) => [file, new Set(lines)]));
    const changedFiles = new Set<string>();
    if (change.clearAll) {
      for (const [file, lines] of linesByFile) {
        lines.clear();
        changedFiles.add(file);
      }
    }
    for (const breakpoint of change.remove) {
      linesByFile.get(breakpoint.file)?.delete(breakpoint.line);
      changedFiles.add(breakpoint.file);
    }
    for (const breakpoint of change.add) {
      linesByFile.set(breakpoint.file, (linesByFile.get(breakpoint.file) ?? new Set()).add(breakpoint.line));
      changedFiles.add(breakpoint.file);
    }
    const connection = await this.connection();
    for (const file of changedFiles) {
      const wanted = [...(linesByFile.get(file) ?? [])].sort((first, second) => first - second);
      const current = currentLinesByFile.get(file) ?? [];
      if (current.some((line) => !wanted.includes(line))) {
        await connection.request('setBreakpoints', { source: this.sourceOf(file), breakpoints: current.map((line) => ({ line: line - 1 })) });
      }
      await connection.request('setBreakpoints', { source: this.sourceOf(file), breakpoints: wanted.map((line) => ({ line: line - 1 })) });
    }
    return this.breakpoints();
  }

  async currentStop(): Promise<GameStop | undefined> {
    const connection = await this.connection();
    const stack = stackTraceSchema.parse(await connection.request('stackTrace', mainThread));
    if (stack.stackFrames.length === 0) {
      return undefined;
    }
    return {
      reason: this.lastStop?.reason ?? 'unknown',
      error: this.lastStop?.error,
      frames: stack.stackFrames.map((frame, index) => ({ index, file: this.resourcePathOf(frame.source.path), line: frame.line + 1, function: frame.name })),
    };
  }

  async waitForStop(timeoutMs: number): Promise<GameStop | undefined> {
    await this.connection();
    const nextStop = this.nextEvent('stopped', timeoutMs);
    const stop = await this.currentStop();
    if (stop !== undefined) {
      return stop;
    }
    return (await nextStop) === undefined ? undefined : this.currentStop();
  }

  async variables(frame: number): Promise<FrameVariables> {
    const connection = await this.connection();
    const scopes = scopesSchema.parse(await connection.request('scopes', { frameId: frame })).scopes;
    const variablesOf = async (scopeName: string): Promise<DebugVariable[]> => {
      const scope = scopes.find((candidate) => candidate.name === scopeName);
      if (scope === undefined) {
        return [];
      }
      const response = await this.receivedVariables(connection, scope.variablesReference);
      return response.variables.map((variable) => ({ name: variable.name, value: objectValuePattern.test(variable.value) ? '(object)' : variable.value }));
    };
    const locals = await variablesOf('Locals');
    const members = await variablesOf('Members');
    return { locals, members: members.filter((member) => member.name !== 'self') };
  }

  async resume(action: ResumeAction, stepTimeoutMs: number): Promise<GameStop | undefined> {
    if ((await this.currentStop()) === undefined) {
      throw new DebugError('The game is not stopped in the debugger, so there is nothing to continue. debug_state waits for it to stop at a breakpoint.');
    }
    const connection = await this.connection();
    this.lastStop = undefined;
    if (action === 'continue') {
      const resumed = this.nextEvent('continued', resumeTimeoutMs);
      await connection.request('continue', mainThread);
      await resumed;
      return undefined;
    }
    const nextStop = this.nextEvent('stopped', stepTimeoutMs);
    await connection.request(stepCommands[action], mainThread);
    return (await nextStop) === undefined ? undefined : this.currentStop();
  }

  close(): void {
    this.openConnection?.close();
    this.openConnection = undefined;
  }

  private async receivedVariables(connection: DebugAdapterConnection, reference: number): Promise<z.infer<typeof variablesSchema>> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return variablesSchema.parse(await connection.request('variables', { variablesReference: reference }));
      } catch (error) {
        const notReceivedYet = error instanceof DebugAdapterRequestError && error.code === variablesNotReceivedCode;
        if (!notReceivedYet || attempt >= variablesAttempts) {
          throw error;
        }
        await delay(variablesRetryDelayMs);
      }
    }
  }

  private async connection(): Promise<DebugAdapterConnection> {
    if (this.openConnection?.isOpen === true) {
      return this.openConnection;
    }
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async open(): Promise<DebugAdapterConnection> {
    const address = await this.dependencies.debugAdapter();
    if (address === undefined) {
      throw new DebugError(
        'The Godot editor is not connected, so its debugger cannot be reached. Start it with editor_launch, or call godot_status to check the project and the connection.',
      );
    }
    let connection: DebugAdapterConnection;
    try {
      connection = await this.dependencies.connect(address.port);
    } catch (error) {
      throw new DebugError(
        `The debug adapter of the Godot editor is not reachable on port ${String(address.port)}: ${error instanceof Error ? error.message : 'unknown error'}. The editor listens on the port of its setting network/debug_adapter/remote_port; set GODOT_DAP_PORT when that is another port.`,
      );
    }
    this.projectPath = address.projectPath;
    try {
      await connection.request('setBreakpoints', { source: this.sourceOf(`${resourcePrefix}project.godot`), breakpoints: [] });
    } catch (error) {
      connection.close();
      if (error instanceof DebugAdapterRequestError && error.code === 'wrong_path') {
        throw new DebugError(
          `The debug adapter on port ${String(address.port)} belongs to another Godot editor, which has ${error.variables['editorPath'] ?? 'another project'} open. Close that editor, or start the editor of this project with --dap-port and set GODOT_DAP_PORT to that port.`,
        );
      }
      throw error;
    }
    this.lastStop = undefined;
    connection.onEvent((event) => {
      this.observe(event);
    });
    this.openConnection = connection;
    return connection;
  }

  private observe(event: DebugAdapterEvent): void {
    if (event.event === 'stopped') {
      const reason = typeof event.body['reason'] === 'string' ? (stopReasons[event.body['reason']] ?? 'unknown') : 'unknown';
      const text = event.body['text'];
      this.lastStop = { reason, error: typeof text === 'string' ? text : undefined };
    } else if (['continued', 'exited', 'terminated'].includes(event.event)) {
      this.lastStop = undefined;
    }
    const waiters = this.eventWaiters.filter((waiter) => waiter.event === event.event);
    this.eventWaiters = this.eventWaiters.filter((waiter) => waiter.event !== event.event);
    for (const waiter of waiters) {
      waiter.resolve(event.body);
    }
  }

  private nextEvent(event: string, timeoutMs: number): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve) => {
      const waiter: EventWaiter = {
        event,
        resolve: (body) => {
          clearTimeout(timer);
          resolve(body);
        },
      };
      const timer = setTimeout(() => {
        this.eventWaiters = this.eventWaiters.filter((candidate) => candidate !== waiter);
        resolve(undefined);
      }, timeoutMs);
      this.eventWaiters.push(waiter);
    });
  }

  private sourceOf(file: string): Record<string, unknown> {
    const path = `${this.projectPath}/${file.slice(resourcePrefix.length)}`;
    return { name: basename(path), path, checksums: [] };
  }

  private resourcePathOf(path: string): string {
    const projectFolder = `${this.projectPath}/`;
    return path.startsWith(projectFolder) ? `${resourcePrefix}${path.slice(projectFolder.length)}` : path;
  }
}

function sourceLineOf(text: string): SourceLine {
  const separator = text.lastIndexOf(':');
  return { file: text.slice(0, separator), line: Number(text.slice(separator + 1)) };
}

function compareSourceLines(first: SourceLine, second: SourceLine): number {
  return first.file === second.file ? first.line - second.line : first.file.localeCompare(second.file);
}
