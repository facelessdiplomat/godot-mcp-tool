import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { GameOutputCursor } from '../runtime/GameOutputCursor.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { type CaptureReader, createGameScreenshotTool } from './captureTools.js';
import { formatLogEntries, logEntrySchema } from './formatting/logEntries.js';
import { createGamePauseTool, createGamePerformanceTool, createGameStepTool } from './gameControlTools.js';
import { createGameGetPropertiesTool, createGameGetTreeTool, createGameSetPropertiesTool, createGameWaitTool } from './gameInspectionTools.js';
import { createGameInputTool, createGameRecordInputTool } from './inputTools.js';
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
    createGameRecordInputTool(game),
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
  windowless: z.boolean().optional(),
  window_size: z.tuple([z.number(), z.number()]).optional(),
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

const debugDrawings = ['collisions', 'navigation', 'paths', 'avoidance'] as const;

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
  debug_draw: z
    .array(z.enum(debugDrawings))
    .optional()
    .describe(
      'Draw debug shapes in the game, as the Debug menu of the editor does: "collisions" for collision shapes, "navigation" for navigation meshes, "paths" for Path3D curves, "avoidance" for avoidance radii. Screenshots then show why a body falls through a floor or a path takes a detour.',
    ),
  arguments: z
    .array(z.string())
    .optional()
    .describe('Arguments for the game, which its scripts read with OS.get_cmdline_user_args(), such as ["--level=3"].'),
  window_size: z
    .tuple([z.number().int().min(64).max(7680), z.number().int().min(64).max(4320)])
    .optional()
    .describe('Size of the game window [width, height] in pixels, such as [1280, 720], to check the layout at another size.'),
  locale: z
    .string()
    .regex(/^[a-z]{2,3}([_-][A-Za-z0-9]+)?$/)
    .optional()
    .describe('Run the game in this locale, such as "de" or "pt_BR", to check its translations.'),
  break_on_error: z
    .boolean()
    .optional()
    .describe('Stop the game in the debugger at its first script error, as at a breakpoint, so that debug_state shows the stack and the variables there. Default: false, the game runs on. Needs the editor.'),
});

export function createGameRunTool(editor: EditorGateway, cursor: GameOutputCursor): BridgeTool<typeof gameRunInput, GameRun> {
  return new BridgeTool(editor, {
    name: 'game_run',
    definition: {
      title: 'Run game',
      description:
        'Run the game and return its first output: the main scene by default, the scene open in the editor, or a scene by path. Waits until the game is ready, then watches it for a second, or for duration_ms and stops it. Runs from the editor, which saves the open scenes and scripts first; without the editor, starts Godot as a separate process. Script errors do not pause the game unless break_on_error is set; they come with file, line and stack.',
      inputSchema: gameRunInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: true,
      showsErrors: true,
    },
    method: 'game.run',
    responseSchema: gameRunSchema,
    params: ({ scene, duration_ms, fixed_fps, debug_draw, arguments: gameArguments, window_size, locale, break_on_error }) => ({
      scene,
      watch_ms: duration_ms ?? defaultWatchMs,
      stop_after: duration_ms !== undefined,
      ...(fixed_fps === undefined ? {} : { fixed_fps }),
      ...(debug_draw === undefined ? {} : { debug_draw }),
      ...(gameArguments === undefined ? {} : { arguments: gameArguments }),
      ...(window_size === undefined ? {} : { window_size }),
      ...(locale === undefined ? {} : { locale }),
      ...(break_on_error === true ? { break_on_error } : {}),
    }),
    timeoutMs: ({ duration_ms }) => runAllowanceMs + (duration_ms ?? defaultWatchMs),
    present: (run, input) => {
      cursor.moveTo(run.next_after);
      return textResult(describeRun(run, input));
    },
  });
}

type GameRunInput = z.infer<typeof gameRunInput>;

function describeRun(run: GameRun, input: GameRunInput): string {
  const { duration_ms: durationMs, fixed_fps: fixedFps, window_size: askedSize } = input;
  const lines = [describeOutcome(run, durationMs)];
  if (run.windowless === true && run.outcome === 'ready' && run.state !== 'stopped') {
    lines.push('It runs without a window, so game_screenshot cannot show it; check it with game_get_properties, game_get_tree and node_get_bounds.');
  }
  if (askedSize !== undefined && run.window_size !== undefined && (run.window_size[0] !== askedSize[0] || run.window_size[1] !== askedSize[1])) {
    lines.push(
      `The game window is ${formatSize(run.window_size)}, not the ${formatSize(askedSize)} asked for: the Game view of the editor sizes a game that it embeds, and keeps the asked size only in its Fixed size mode and when the view is large enough.`,
    );
  }
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

function formatSize([width, height]: readonly [number, number]): string {
  return `${String(width)}×${String(height)}`;
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
      alwaysLoad: true,
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
