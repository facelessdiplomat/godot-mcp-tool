import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { GameOutputCursor } from '../runtime/GameOutputCursor.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { type CaptureReader, createGameScreenshotTool } from './captureTools.js';
import { formatLogEntries, logEntrySchema } from './formatting/logEntries.js';
import { createGamePauseTool, createGamePerformanceTool, createGameStepTool } from './gameControlTools.js';
import { createGameGetPropertiesTool, createGameGetTreeTool, createGameSetPropertiesTool, createGameWaitTool } from './gameInspectionTools.js';
import { createGameInputTool } from './inputTools.js';
import { textResult } from './results.js';
import type { Tool } from './Tool.js';

export function createGameTools(game: EditorGateway, cursor: GameOutputCursor, readCapture: CaptureReader): Tool[] {
  return [
    createGameRunTool(game, cursor),
    createGameStopTool(game),
    createGameGetOutputTool(game, cursor),
    createGameGetTreeTool(game),
    createGameGetPropertiesTool(game),
    createGameSetPropertiesTool(game),
    createGameWaitTool(game),
    createGameInputTool(game, readCapture),
    createGameScreenshotTool(game, readCapture),
    createGamePauseTool(game),
    createGameStepTool(game),
    createGamePerformanceTool(game),
  ];
}

const defaultWatchMs = 1000;
const runAllowanceMs = 45_000;

const gameRunSchema = z.object({
  scene: z.string(),
  outcome: z.enum(['ready', 'stopped', 'timeout', 'paused']),
  state: z.string(),
  startup_ms: z.number(),
  output: z.array(logEntrySchema),
  more_output: z.boolean(),
  next_after: z.number(),
  saved_scenes: z.array(z.string()),
  saved_scripts: z.array(z.string()),
});

type GameRun = z.infer<typeof gameRunSchema>;

const outputPageSchema = z.object({
  entries: z.array(logEntrySchema),
  more: z.boolean(),
  next_after: z.number(),
  skipped: z.number(),
  last_seq: z.number(),
  state: z.string(),
});

type OutputPage = z.infer<typeof outputPageSchema>;

const stoppedGameSchema = z.object({ was_running: z.boolean() });

type StoppedGame = z.infer<typeof stoppedGameSchema>;

const gameRunInput = z.object({
  scene: z
    .string()
    .default('main')
    .describe('What to run: "main" (the main scene of the project), "current" (the scene open in the editor), or a res://….tscn path. Default: "main".'),
  duration_ms: z
    .number()
    .int()
    .min(0)
    .max(600_000)
    .optional()
    .describe('Keep the game running this long after it is ready, then stop it. Without it, the game keeps running after the first second of output.'),
  fixed_fps: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      'Run with a fixed frame rate, such as 60: every frame advances the game by exactly 1/fps seconds, so runs repeat exactly. Game time then no longer follows the clock, and without a window the game runs as fast as it can, so count waits and holds in physics frames.',
    ),
});

export function createGameRunTool(editor: EditorGateway, cursor: GameOutputCursor): BridgeTool<typeof gameRunInput, GameRun> {
  return new BridgeTool(editor, {
    name: 'game_run',
    definition: {
      title: 'Run game',
      description:
        'Run the game and return its first output: the main scene by default, the scene open in the editor, or a scene by path. Waits until the game is ready, then watches it for a second, or for duration_ms and stops it. Runs from the editor, which saves the open scenes and scripts first; without the editor, starts Godot as a separate process. Script errors do not pause the game; they come with file, line and stack.',
      inputSchema: gameRunInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: true,
      showsErrors: true,
    },
    method: 'game.run',
    responseSchema: gameRunSchema,
    params: ({ scene, duration_ms, fixed_fps }) => ({
      scene,
      watch_ms: duration_ms ?? defaultWatchMs,
      stop_after: duration_ms !== undefined,
      ...(fixed_fps === undefined ? {} : { fixed_fps }),
    }),
    timeoutMs: ({ duration_ms }) => runAllowanceMs + (duration_ms ?? defaultWatchMs),
    present: (run, input) => {
      cursor.moveTo(run.next_after);
      return textResult(describeRun(run, input.duration_ms, input.fixed_fps));
    },
  });
}

function describeRun(run: GameRun, durationMs: number | undefined, fixedFps: number | undefined): string {
  const lines = [describeOutcome(run, durationMs)];
  if (fixedFps !== undefined) {
    lines.push(`Every frame advances the game by exactly 1/${String(fixedFps)} s, however long it takes, so wait and hold for physics frames, not milliseconds.`);
  }
  const saved = [...run.saved_scenes, ...run.saved_scripts];
  if (saved.length > 0) {
    lines.push(`Running saved ${saved.join(', ')} first, as the editor does.`);
  }
  if (run.output.length === 0) {
    lines.push('No output yet.');
  } else {
    lines.push('Output:', formatLogEntries(run.output));
  }
  if (run.more_output) {
    lines.push('More output follows; read it with game_get_output.');
  }
  return lines.join('\n');
}

function describeOutcome(run: GameRun, durationMs: number | undefined): string {
  switch (run.outcome) {
    case 'stopped':
      return `The game stopped before it was ready (${run.scene}).`;
    case 'paused':
      return `The game stopped in the debugger before it was ready (${run.scene}), at a breakpoint or on an error: debug_state shows where and why.`;
    case 'timeout':
      return `The game did not report that it was ready within 30 s (${run.scene}); it may still be loading. Check it with game_get_output.`;
    case 'ready':
      if (durationMs !== undefined) {
        return `The game ran ${run.scene} for ${String(durationMs)} ms after it was ready and was stopped.`;
      }
      if (run.state === 'stopped') {
        return `The game started ${run.scene} and quit on its own soon after it was ready.`;
      }
      if (run.state === 'paused') {
        return `The game is stopped in the debugger in ${run.scene}, at a breakpoint or on an error: debug_state shows where and why.`;
      }
      return `The game is running ${run.scene}; it was ready after ${String(run.startup_ms)} ms.`;
  }
}

const gameStopInput = z.object({});

export function createGameStopTool(editor: EditorGateway): BridgeTool<typeof gameStopInput, StoppedGame> {
  return new BridgeTool(editor, {
    name: 'game_stop',
    definition: {
      title: 'Stop game',
      description: 'Stop the running game.',
      inputSchema: gameStopInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'game.stop',
    responseSchema: stoppedGameSchema,
    present: ({ was_running }) => textResult(was_running ? 'Stopped the game.' : 'The game was not running.'),
  });
}

const gameGetOutputInput = z.object({
  levels: z.array(z.enum(['error', 'warning', 'info'])).optional().describe('Only these levels, such as ["error"]. Default: all.'),
  from_start: z.boolean().default(false).describe('Read the current run from its start instead of only what came after the last call.'),
  max_entries: z.number().int().min(1).max(500).default(100).describe('The most entries to return; call again for the rest.'),
});

export function createGameGetOutputTool(editor: EditorGateway, cursor: GameOutputCursor): BridgeTool<typeof gameGetOutputInput, OutputPage> {
  return new BridgeTool(editor, {
    name: 'game_get_output',
    definition: {
      title: 'Game output',
      description:
        'Read what the game printed since the last call: messages, warnings and errors with file, line and stack, plus errors the editor reported, such as script parse errors. Pass levels: ["error"] for errors only, or from_start to read the current run again from its start.',
      inputSchema: gameGetOutputInput,
      annotations: readingAnnotations,
      alwaysLoad: true,
      showsErrors: true,
    },
    method: 'game.get_output',
    responseSchema: outputPageSchema,
    params: ({ levels, from_start, max_entries }) => ({
      after: from_start ? -1 : cursor.after,
      ...(levels === undefined ? {} : { levels }),
      limit: max_entries,
    }),
    present: (page) => {
      cursor.moveTo(page.next_after);
      return textResult(describeOutputPage(page));
    },
  });
}

function describeOutputPage(page: OutputPage): string {
  const lines = [describeGameState(page.state)];
  if (page.skipped > 0) {
    lines.push(`${String(page.skipped)} older entries no longer fit in the buffer.`);
  }
  lines.push(page.entries.length === 0 ? 'No new output.' : formatLogEntries(page.entries));
  if (page.more) {
    lines.push('More output follows; call game_get_output again.');
  }
  return lines.join('\n');
}

function describeGameState(state: string): string {
  switch (state) {
    case 'running':
      return 'The game is running.';
    case 'starting':
      return 'The game is starting.';
    case 'paused':
      return 'The game is stopped in the debugger; debug_state shows where and why.';
    default:
      return 'The game is not running.';
  }
}
