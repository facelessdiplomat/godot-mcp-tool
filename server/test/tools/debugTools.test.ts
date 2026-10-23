import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import {
  type BreakpointChange,
  DebugError,
  type FrameVariables,
  type GameStop,
  type ResumeAction,
  type SourceLine,
} from '../../src/debug/GameDebugger.js';
import { EditorUnavailableError } from '../../src/editor/EditorGateway.js';
import type { ErrorDismissal, LoggedError } from '../../src/runtime/ErrorSummary.js';
import { createDebugBreakpointsTool, createDebugContinueTool, createDebugStateTool, type GameDebugService } from '../../src/tools/debugTools.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const playerScript = [
  'extends CharacterBody3D',
  '',
  'const JUMP_SPEED := 4.5',
  '',
  '# Jumps when the player asks for it.',
  'func _physics_process(delta: float) -> void:',
  '\tvar direction := Vector3.FORWARD',
  '\tvelocity.y = JUMP_SPEED',
  '\tmove_and_slide()',
];

const scripts: Readonly<Record<string, readonly string[]>> = { 'res://player.gd': playerScript };

function readScript(file: string): readonly string[] | undefined {
  return scripts[file];
}

class RecordingDismissal implements ErrorDismissal {
  readonly predicates: ((error: LoggedError) => boolean)[] = [];

  dismiss(isCovered: (error: LoggedError) => boolean): void {
    this.predicates.push(isCovered);
  }
}

const noDismissal = new RecordingDismissal();

const stopAtJump: GameStop = {
  reason: 'breakpoint',
  error: undefined,
  frames: [
    { index: 0, file: 'res://player.gd', line: 8, function: '_physics_process' },
    { index: 1, file: 'res://world.gd', line: 40, function: 'tick' },
  ],
};

const jumpVariables: FrameVariables = {
  locals: [
    { name: 'delta', value: '0.016667' },
    { name: 'direction', value: '(0, 0, -1)' },
  ],
  members: [{ name: 'velocity', value: '(0, -9.8, 0)' }],
};

class FakeGameDebugger implements GameDebugService {
  readonly changes: BreakpointChange[] = [];
  readonly waits: number[] = [];
  readonly resumes: ResumeAction[] = [];
  current: SourceLine[] = [];
  stop: GameStop | undefined;
  stepStop: GameStop | undefined;
  failure: Error | undefined;

  breakpoints(): Promise<SourceLine[]> {
    return this.failure === undefined ? Promise.resolve(this.current) : Promise.reject(this.failure);
  }

  changeBreakpoints(change: BreakpointChange): Promise<SourceLine[]> {
    this.changes.push(change);
    this.current = [...this.current.filter((line) => !change.clearAll && !change.remove.some((removed) => removed.file === line.file && removed.line === line.line)), ...change.add];
    return Promise.resolve(this.current);
  }

  waitForStop(timeoutMs: number): Promise<GameStop | undefined> {
    this.waits.push(timeoutMs);
    return Promise.resolve(this.stop);
  }

  variables(): Promise<FrameVariables> {
    return Promise.resolve(jumpVariables);
  }

  resume(action: ResumeAction): Promise<GameStop | undefined> {
    this.resumes.push(action);
    if (this.stop === undefined) {
      return Promise.reject(new DebugError('The game is not stopped in the debugger, so there is nothing to continue.'));
    }
    return Promise.resolve(action === 'continue' ? undefined : this.stepStop);
  }
}

describe('debug_breakpoints', () => {
  it('adds breakpoints and lists every breakpoint with its line of code', async () => {
    const service = new FakeGameDebugger();

    const result = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({ add: ['res://player.gd:8', 'res://player.gd:5'], remove: ['res://enemy.gd:7'] });

    expect(service.changes).toEqual([
      {
        add: [
          { file: 'res://player.gd', line: 8 },
          { file: 'res://player.gd', line: 5 },
        ],
        remove: [{ file: 'res://enemy.gd', line: 7 }],
        clearAll: false,
      },
    ]);
    expect(textOf(result)).toBe(
      [
        'Breakpoints:',
        '- res://player.gd:8  velocity.y = JUMP_SPEED',
        '- res://player.gd:5  (a comment: the game never stops here)',
        'The game stops at them when it runs from the editor; debug_state shows where it stopped.',
      ].join('\n'),
    );
  });

  it('leaves out the error the editor logs for a breakpoint in a script it has not opened yet', async () => {
    const dismissal = new RecordingDismissal();

    await createDebugBreakpointsTool(new FakeGameDebugger(), readScript, dismissal).execute({ add: ['res://player.gd:8'] });
    const [isCovered] = dismissal.predicates;
    const stateError = (file: string): LoggedError => ({
      source: 'editor',
      message: `Couldn't find the given section "${file}" and key "state", and no default was given.`,
      location: 'core/io/config_file.cpp:61',
    });

    expect(isCovered?.(stateError('res://player.gd'))).toBe(true);
    expect(isCovered?.(stateError('res://enemy.gd'))).toBe(false);
    expect(isCovered?.({ source: 'game', message: stateError('res://player.gd').message })).toBe(false);
  });

  it('lists the breakpoints without changing them, and says when there are none', async () => {
    const service = new FakeGameDebugger();

    const none = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({});
    service.current = [{ file: 'res://player.gd', line: 2 }];
    const listed = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({});

    expect(service.changes).toEqual([]);
    expect(textOf(none)).toBe('The project has no breakpoints. Add them with add, such as ["res://player/player.gd:42"].');
    expect(textOf(listed)).toContain('- res://player.gd:2  (an empty line: the game never stops here)');
  });

  it('refuses lines that a script does not have and scripts that do not exist, changing nothing', async () => {
    const service = new FakeGameDebugger();

    const pastTheEnd = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({ add: ['res://player.gd:30'] });
    const missing = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({ add: ['res://enemy.gd:3'] });
    const malformed = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({ add: ['player.gd line 3'] });

    expect(pastTheEnd.isError).toBe(true);
    expect(textOf(pastTheEnd)).toBe('res://player.gd has 9 lines, so it has no line 30.');
    expect(textOf(missing)).toBe('res://enemy.gd does not exist.');
    expect(malformed.isError).toBe(true);
    expect(service.changes).toEqual([]);
  });

  it('reports an editor that is not connected', async () => {
    const service = new FakeGameDebugger();
    service.failure = new EditorUnavailableError('The Godot editor is not running for this project.');

    const result = await createDebugBreakpointsTool(service, readScript, noDismissal).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'The Godot editor is not connected: The Godot editor is not running for this project.\nStart it with editor_launch, or call godot_status to check the project and the connection.',
    );
  });
});

describe('debug_state', () => {
  it('shows where the game stopped, the stack, the code around the line and the variables', async () => {
    const service = new FakeGameDebugger();
    service.stop = stopAtJump;

    const result = await createDebugStateTool(service, readScript).execute({ wait_ms: 5000 });

    expect(service.waits).toEqual([5000]);
    expect(textOf(result)).toBe(
      [
        'The game stopped at a breakpoint at res://player.gd:8 in _physics_process.',
        'Stack:',
        '- #0 res://player.gd:8 in _physics_process',
        '- #1 res://world.gd:40 in tick',
        'Code of #0:',
        '  6 | func _physics_process(delta: float) -> void:',
        '  7 |     var direction := Vector3.FORWARD',
        '> 8 |     velocity.y = JUMP_SPEED',
        '  9 |     move_and_slide()',
        'Locals of #0:',
        '- delta = 0.016667',
        '- direction = (0, 0, -1)',
        'Members of #0:',
        '- velocity = (0, -9.8, 0)',
        'Resume with debug_continue: action "continue", "step_over" or "step_into".',
      ].join('\n'),
    );
  });

  it('names the error the game stopped on and refuses a frame the stack does not have', async () => {
    const service = new FakeGameDebugger();
    service.stop = { reason: 'error', error: 'Invalid access to property "y" on a null instance.', frames: [stopAtJump.frames[0] ?? { index: 0, file: '', line: 0, function: '' }] };

    const stopped = await createDebugStateTool(service, readScript).execute({});
    const outOfRange = await createDebugStateTool(service, readScript).execute({ frame: 3 });

    expect(textOf(stopped)).toMatch(/^The game stopped on an error at res:\/\/player\.gd:8 in _physics_process: Invalid access to property "y" on a null instance\.\n/);
    expect(outOfRange.isError).toBe(true);
    expect(textOf(outOfRange)).toBe('The stack has 1 frame, so there is no frame 3.');
  });

  it('says that the game is not stopped, also after waiting', async () => {
    const service = new FakeGameDebugger();

    const now = await createDebugStateTool(service, readScript).execute({});
    const waited = await createDebugStateTool(service, readScript).execute({ wait_ms: 2000 });

    expect(textOf(now)).toBe(
      'The game is not stopped in the debugger. Set breakpoints with debug_breakpoints and run the game with game_run; debug_state with wait_ms waits for the game to stop at one.',
    );
    expect(textOf(waited)).toMatch(/^The game did not stop in the debugger within 2000 ms\. /);
  });
});

describe('debug_continue', () => {
  it('continues the game, or steps to the next line and shows it', async () => {
    const service = new FakeGameDebugger();
    service.stop = stopAtJump;
    service.stepStop = { reason: 'step', error: undefined, frames: [{ index: 0, file: 'res://player.gd', line: 9, function: '_physics_process' }] };

    const continued = await createDebugContinueTool(service, readScript).execute({});
    const stepped = await createDebugContinueTool(service, readScript).execute({ action: 'step_over' });

    expect(service.resumes).toEqual(['continue', 'step_over']);
    expect(textOf(continued)).toBe('The game continues. debug_state with wait_ms waits for it to stop at the next breakpoint.');
    expect(textOf(stepped)).toBe(
      [
        'Stepped over to res://player.gd:9 in _physics_process:',
        '> 9 |     move_and_slide()',
        'Locals of #0:',
        '- delta = 0.016667',
        '- direction = (0, 0, -1)',
        'Members of #0:',
        '- velocity = (0, -9.8, 0)',
      ].join('\n'),
    );
  });

  it('explains a step after which the game did not stop again, and a game that is not stopped', async () => {
    const service = new FakeGameDebugger();
    service.stop = stopAtJump;

    const ranOn = await createDebugContinueTool(service, readScript).execute({ action: 'step_into' });
    service.stop = undefined;
    const notStopped = await createDebugContinueTool(service, readScript).execute({});

    expect(textOf(ranOn)).toBe('The game ran on after the step and did not stop within 5 s; debug_state with wait_ms waits for the next stop.');
    expect(notStopped.isError).toBe(true);
    expect(textOf(notStopped)).toBe('The game is not stopped in the debugger, so there is nothing to continue.');
  });
});
