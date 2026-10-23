import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeRequestError } from '../bridge/BridgeErrors.js';
import { DebugAdapterRequestError, DebugAdapterUnavailableError } from '../debug/DebugAdapterClient.js';
import {
  type BreakpointChange,
  DebugError,
  type FrameVariables,
  type GameStop,
  type ResumeAction,
  type SourceLine,
  type StackFrame,
  type StopReason,
} from '../debug/GameDebugger.js';
import { EditorUnavailableError } from '../editor/EditorGateway.js';
import type { ErrorDismissal, LoggedError } from '../runtime/ErrorSummary.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { counted } from './formatting/counting.js';
import { errorResult, textResult } from './results.js';
import type { Tool } from './Tool.js';

export interface GameDebugService {
  breakpoints(): Promise<SourceLine[]>;
  changeBreakpoints(change: BreakpointChange): Promise<SourceLine[]>;
  waitForStop(timeoutMs: number): Promise<GameStop | undefined>;
  variables(frame: number): Promise<FrameVariables>;
  resume(action: ResumeAction, stepTimeoutMs: number): Promise<GameStop | undefined>;
}

export type ScriptReader = (file: string) => readonly string[] | undefined;

const sourceLinePattern = /^(?<file>res:\/\/.+\.gd):(?<line>[1-9]\d*)$/;
const missingScriptStatePattern = /^Couldn't find the given section "(?<file>[^"]+)" and key "state"/;
const editorSource = 'editor';
const contextLinesBefore = 2;
const contextLinesAfter = 2;
const maximumCodeLength = 100;
const stepTimeoutMs = 5_000;
const tabWidth = '    ';
const stopPhrases: Readonly<Record<StopReason, string>> = {
  breakpoint: 'stopped at a breakpoint',
  step: 'stopped after a step',
  error: 'stopped on an error',
  pause: 'was paused in the debugger',
  unknown: 'is stopped in the debugger',
};
const stepPhrases: Readonly<Record<Exclude<ResumeAction, 'continue'>, string>> = { step_over: 'Stepped over', step_into: 'Stepped into' };

const sourceLineText = z.string().regex(sourceLinePattern, 'Write a breakpoint as "res://path.gd:line", with the line counted from 1, such as "res://player/player.gd:42".');

const debugBreakpointsInput = z.object({
  add: z
    .array(sourceLineText)
    .default([])
    .describe('Breakpoints to add, each "res://path.gd:line" with the line counted from 1, such as ["res://player/player.gd:42"].'),
  remove: z.array(sourceLineText).default([]).describe('Breakpoints to remove, written the same way.'),
  clear: z.boolean().default(false).describe('Remove every breakpoint of the project first, also those the user set in the script editor.'),
});

export function createDebugBreakpointsTool(service: GameDebugService, readScript: ScriptReader, editorErrors: ErrorDismissal): Tool<typeof debugBreakpointsInput> {
  return {
    name: 'debug_breakpoints',
    definition: {
      title: 'Set breakpoints',
      description:
        "Add or remove breakpoints in GDScript files, or list them. The game stops at a breakpoint when its code reaches that line while it runs from the editor (game_run), and debug_state then shows the stack and the variables there. They are the editor's own breakpoints, so the user sees them in the script editor; clear removes all of them, also those the user set. A breakpoint on an empty line or a comment never stops the game.",
      inputSchema: debugBreakpointsInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    execute: (input) =>
      withParsedInput('debug_breakpoints', debugBreakpointsInput, input, async ({ add, remove, clear }) => {
        const added = add.map(sourceLineOf);
        for (const breakpoint of added) {
          checkScriptLine(breakpoint, readScript);
        }
        const unchanged = added.length === 0 && remove.length === 0 && !clear;
        const breakpoints = unchanged ? await service.breakpoints() : await service.changeBreakpoints({ add: added, remove: remove.map(sourceLineOf), clearAll: clear });
        editorErrors.dismiss(isMissingScriptStateOf(added.map((breakpoint) => breakpoint.file)));
        if (breakpoints.length === 0) {
          return 'The project has no breakpoints. Add them with add, such as ["res://player/player.gd:42"].';
        }
        return [
          'Breakpoints:',
          ...breakpoints.map((breakpoint) => describeBreakpoint(breakpoint, readScript)),
          'The game stops at them when it runs from the editor; debug_state shows where it stopped.',
        ].join('\n');
      }),
  };
}

const debugStateInput = z.object({
  wait_ms: z
    .number()
    .int()
    .min(0)
    .max(300_000)
    .default(0)
    .describe('When the game is not stopped, wait this long for it to stop at a breakpoint, such as after game_input made the player jump. Default: 0, answer at once.'),
  frame: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('The stack frame whose code and variables to show: 0 is the line where the game stopped, 1 the function that called it, and so on.'),
});

export function createDebugStateTool(service: GameDebugService, readScript: ScriptReader): Tool<typeof debugStateInput> {
  return {
    name: 'debug_state',
    definition: {
      title: 'Debugger state',
      description:
        'Show where the game stopped in the debugger and why — a breakpoint, a step or an error — with the stack of function calls, the code around the line, and the local variables and members of a stack frame. With wait_ms it first waits for the game to stop, such as after game_input made the player do what reaches the breakpoint. While the game is stopped, game_get_properties still reads nodes, but game_wait, game_input and screenshots need debug_continue first.',
      inputSchema: debugStateInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    execute: (input) =>
      withParsedInput('debug_state', debugStateInput, input, async ({ wait_ms: waitMs, frame }) => {
        const stop = await service.waitForStop(waitMs);
        if (stop === undefined) {
          return waitMs === 0
            ? 'The game is not stopped in the debugger. Set breakpoints with debug_breakpoints and run the game with game_run; debug_state with wait_ms waits for the game to stop at one.'
            : `The game did not stop in the debugger within ${String(waitMs)} ms. It stops only at breakpoints that its code reaches; debug_breakpoints lists them.`;
        }
        const shownFrame = stop.frames[frame];
        if (shownFrame === undefined) {
          throw new DebugError(`The stack has ${counted(stop.frames.length, 'frame')}, so there is no frame ${String(frame)}.`);
        }
        return [
          describeStopHeading(stop),
          'Stack:',
          ...stop.frames.map((stackFrame) => `- #${String(stackFrame.index)} ${locationOf(stackFrame)}`),
          ...describeCode(shownFrame, readScript),
          ...describeVariables(shownFrame, await service.variables(frame)),
          'Resume with debug_continue: action "continue", "step_over" or "step_into".',
        ].join('\n');
      }),
  };
}

const debugContinueInput = z.object({
  action: z
    .enum(['continue', 'step_over', 'step_into'])
    .default('continue')
    .describe(
      '"continue" runs the game until the next breakpoint; "step_over" runs the current line and stops at the next one; "step_into" also stops inside the functions that the line calls. Default: "continue".',
    ),
});

export function createDebugContinueTool(service: GameDebugService, readScript: ScriptReader): Tool<typeof debugContinueInput> {
  return {
    name: 'debug_continue',
    definition: {
      title: 'Continue or step',
      description:
        'Resume the game stopped in the debugger, until the next breakpoint, or by one line of code at a time. After a step the result shows the new line and its variables.',
      inputSchema: debugContinueInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    execute: (input) =>
      withParsedInput('debug_continue', debugContinueInput, input, async ({ action }) => {
        const stop = await service.resume(action, stepTimeoutMs);
        if (action === 'continue') {
          return 'The game continues. debug_state with wait_ms waits for it to stop at the next breakpoint.';
        }
        const top = stop?.frames[0];
        if (stop === undefined || top === undefined) {
          return `The game ran on after the step and did not stop within ${String(stepTimeoutMs / 1000)} s; debug_state with wait_ms waits for the next stop.`;
        }
        return [`${stepPhrases[action]} to ${locationOf(top)}:`, ...codeLines(top, readScript, 0, 0), ...describeVariables(top, await service.variables(0))].join('\n');
      }),
  };
}

async function withParsedInput<InputSchema extends z.ZodObject>(
  toolName: string,
  schema: InputSchema,
  input: z.input<InputSchema>,
  work: (parsedInput: z.output<InputSchema>) => Promise<string>,
): Promise<CallToolResult> {
  const parsedInput = schema.safeParse(input);
  if (!parsedInput.success) {
    return errorResult(`Invalid arguments for ${toolName}:\n${z.prettifyError(parsedInput.error)}`);
  }
  try {
    return textResult(await work(parsedInput.data));
  } catch (error) {
    return describeFailure(error);
  }
}

function describeFailure(error: unknown): CallToolResult {
  if (error instanceof DebugError || error instanceof DebugAdapterUnavailableError || error instanceof DebugAdapterRequestError) {
    return errorResult(error.message);
  }
  if (error instanceof EditorUnavailableError) {
    return errorResult(`The Godot editor is not connected: ${error.message}\nStart it with editor_launch, or call godot_status to check the project and the connection.`);
  }
  if (error instanceof BridgeRequestError) {
    return errorResult(error.hint === undefined || error.hint === '' ? error.message : `${error.message}\nHint: ${error.hint}`);
  }
  throw error;
}

function isMissingScriptStateOf(files: readonly string[]): (error: LoggedError) => boolean {
  return (error) => error.source === editorSource && files.includes(missingScriptStatePattern.exec(error.message)?.groups?.['file'] ?? '');
}

function sourceLineOf(text: string): SourceLine {
  const parts = sourceLinePattern.exec(text)?.groups;
  return { file: parts?.['file'] ?? '', line: Number(parts?.['line']) };
}

function checkScriptLine(breakpoint: SourceLine, readScript: ScriptReader): void {
  const lines = readScript(breakpoint.file);
  if (lines === undefined) {
    throw new DebugError(`${breakpoint.file} does not exist.`);
  }
  if (breakpoint.line > lines.length) {
    throw new DebugError(`${breakpoint.file} has ${counted(lines.length, 'line')}, so it has no line ${String(breakpoint.line)}.`);
  }
}

function describeBreakpoint(breakpoint: SourceLine, readScript: ScriptReader): string {
  const location = `- ${breakpoint.file}:${String(breakpoint.line)}`;
  const code = readScript(breakpoint.file)?.[breakpoint.line - 1]?.trim();
  if (code === undefined) {
    return location;
  }
  if (code === '') {
    return `${location}  (an empty line: the game never stops here)`;
  }
  if (code.startsWith('#')) {
    return `${location}  (a comment: the game never stops here)`;
  }
  return `${location}  ${code.slice(0, maximumCodeLength)}`;
}

function describeStopHeading(stop: GameStop): string {
  const [top] = stop.frames;
  const location = top === undefined ? '' : ` at ${locationOf(top)}`;
  return stop.reason === 'error' && stop.error !== undefined ? `The game ${stopPhrases.error}${location}: ${stop.error}` : `The game ${stopPhrases[stop.reason]}${location}.`;
}

function locationOf(frame: StackFrame): string {
  return `${frame.file}:${String(frame.line)} in ${frame.function}`;
}

function describeCode(frame: StackFrame, readScript: ScriptReader): string[] {
  const lines = codeLines(frame, readScript, contextLinesBefore, contextLinesAfter);
  return lines.length === 0 ? [] : [`Code of #${String(frame.index)}:`, ...lines];
}

function codeLines(frame: StackFrame, readScript: ScriptReader, before: number, after: number): string[] {
  const lines = readScript(frame.file);
  if (lines === undefined || frame.line < 1 || frame.line > lines.length) {
    return [];
  }
  const first = Math.max(1, frame.line - before);
  const last = Math.min(lines.length, frame.line + after);
  const width = String(last).length;
  const shown: string[] = [];
  for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
    const marker = lineNumber === frame.line ? '>' : ' ';
    const code = (lines[lineNumber - 1] ?? '').replaceAll('\t', tabWidth).slice(0, maximumCodeLength);
    shown.push(`${marker} ${String(lineNumber).padStart(width)} | ${code}`.trimEnd());
  }
  return shown;
}

function describeVariables(frame: StackFrame, variables: FrameVariables): string[] {
  const section = (title: string, list: FrameVariables['locals']): string[] =>
    list.length === 0 ? [] : [`${title} of #${String(frame.index)}:`, ...list.map((variable) => `- ${variable.name} = ${variable.value}`)];
  return [...section('Locals', variables.locals), ...section('Members', variables.members)];
}
