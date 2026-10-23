import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { textResult } from './results.js';

const gameControlAllowanceMs = 75_000;
const bytesPerMegabyte = 1024 * 1024;

const pauseResultSchema = z.object({ paused: z.boolean(), was_paused: z.boolean(), game_frame: z.number() });

type PauseResult = z.infer<typeof pauseResultSchema>;

const stepResultSchema = z.object({ physics_frames: z.number(), was_paused: z.boolean(), game_frame: z.number() });

type StepResult = z.infer<typeof stepResultSchema>;

const sampleSummarySchema = z.object({ average: z.number(), p95: z.number(), max: z.number() });

type SampleSummary = z.infer<typeof sampleSummarySchema>;

const performanceSchema = z.object({
  scene: z.string(),
  frames: z.number(),
  paused: z.boolean(),
  headless: z.boolean(),
  frame_ms: sampleSummarySchema,
  process_ms: sampleSummarySchema,
  physics_ms: sampleSummarySchema,
  draw_calls: sampleSummarySchema,
  primitives: sampleSummarySchema,
  drawn_objects: sampleSummarySchema,
  memory_bytes: z.number(),
  memory_peak_bytes: z.number(),
  video_memory_bytes: z.number(),
  objects: z.number(),
  nodes: z.number(),
  orphan_nodes: z.number(),
  resources: z.number(),
  physics_3d_active_objects: z.number(),
  physics_3d_collision_pairs: z.number(),
  physics_3d_islands: z.number(),
});

type Performance = z.infer<typeof performanceSchema>;

const gamePauseInput = z.object({
  paused: z.boolean().default(true).describe('false resumes a paused game.'),
});

export function createGamePauseTool(game: EditorGateway): BridgeTool<typeof gamePauseInput, PauseResult> {
  return new BridgeTool(game, {
    name: 'game_pause',
    definition: {
      title: 'Pause or resume the game',
      description:
        'Pause the running game so that nothing moves, or resume it with paused: false. While it is paused, game_get_properties, game_screenshot and node_get_bounds read a frozen moment; game_step advances it by exact physics frames, and game_input and game_wait play it only for their holds and waits, then pause it again. Input sent while it is paused reaches the game in the next frame it plays. Nodes that the game sets to always process keep running. Needs a game started with game_run, with or without the editor.',
      inputSchema: gamePauseInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'game.pause',
    responseSchema: pauseResultSchema,
    present: (result) => textResult(describePause(result)),
  });
}

function describePause(result: PauseResult): string {
  const frame = `its physics frame ${String(result.game_frame)}`;
  if (result.paused === result.was_paused) {
    return result.paused ? `The game was paused already, at ${frame}.` : `The game was running already, at ${frame}.`;
  }
  if (result.paused) {
    return `Paused the game at ${frame}. Read it with game_get_properties or game_screenshot. game_step, game_input and game_wait play it on by exact physics frames and pause it again; game_pause with paused: false resumes it.`;
  }
  return `Resumed the game at ${frame}.`;
}

const gameStepInput = z.object({
  physics_frames: z.number().int().min(1).max(3600).default(1).describe('How many physics frames to advance the game by (60 per second by default).'),
});

export function createGameStepTool(game: EditorGateway): BridgeTool<typeof gameStepInput, StepResult> {
  return new BridgeTool(game, {
    name: 'game_step',
    definition: {
      title: 'Step the game',
      description:
        'Advance the paused game by exactly the given number of physics frames and keep it paused, to check what happens frame by frame, such as the height of a jump after 10 frames. Input sent while the game is paused reaches it in the first of these frames. A running game is paused after the frames. Needs a game started with game_run, with or without the editor.',
      inputSchema: gameStepInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'game.step',
    responseSchema: stepResultSchema,
    timeoutMs: gameControlAllowanceMs,
    present: (result) => textResult(describeStep(result)),
  });
}

function describeStep(result: StepResult): string {
  const frames = `${String(result.physics_frames)} ${result.physics_frames === 1 ? 'physics frame' : 'physics frames'}`;
  if (result.was_paused) {
    return `Advanced the game by ${frames} to its physics frame ${String(result.game_frame)}; it stays paused.`;
  }
  return `Let the running game advance ${frames.replace(/^(\d+) /, '$1 more ')} and paused it at its physics frame ${String(result.game_frame)}.`;
}

const gamePerformanceInput = z.object({
  frames: z.number().int().min(1).max(600).default(60).describe('How many frames to measure.'),
});

export function createGamePerformanceTool(game: EditorGateway): BridgeTool<typeof gamePerformanceInput, Performance> {
  return new BridgeTool(game, {
    name: 'game_performance',
    definition: {
      title: 'Game performance',
      description:
        'Measure how the running game performs over a number of frames: frame time and FPS, time spent in process and physics code, draw calls and primitives, memory, counts of objects and nodes with orphan nodes (a sign of leaks), and the load of 3D physics. Needs a game started with game_run, with or without the editor.',
      inputSchema: gamePerformanceInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.performance',
    responseSchema: performanceSchema,
    timeoutMs: gameControlAllowanceMs,
    present: (measured) => textResult(describePerformance(measured)),
  });
}

function describePerformance(measured: Performance): string {
  const place = measured.scene === '' ? 'the running game' : `the running game (${measured.scene})`;
  const lines = [`Performance of ${place} over ${String(measured.frames)} frames:`];
  if (measured.paused) {
    lines.push('The game is paused, so these numbers show an idle game.');
  }
  const framesPerSecond = Math.round(1000 / measured.frame_ms.average);
  lines.push(
    `Frame time: average ${milliseconds(measured.frame_ms.average)} (${String(framesPerSecond)} FPS), 95th percentile ${milliseconds(measured.frame_ms.p95)}, worst ${milliseconds(measured.frame_ms.max)}`,
    `Process: ${averageAndWorst(measured.process_ms)}; physics: ${averageAndWorst(measured.physics_ms)}`,
  );
  if (measured.headless) {
    lines.push('Rendering: none, the game runs without a window');
  } else {
    lines.push(
      `Rendering per frame: ${String(Math.round(measured.draw_calls.average))} draw calls, ${String(Math.round(measured.primitives.average))} primitives, ${String(Math.round(measured.drawn_objects.average))} objects on average`,
    );
  }
  lines.push(
    `Memory: ${megabytes(measured.memory_bytes)}, peak ${megabytes(measured.memory_peak_bytes)}; video memory ${megabytes(measured.video_memory_bytes)}`,
    `Objects: ${String(measured.objects)}, nodes: ${String(measured.nodes)}, ${describeOrphans(measured.orphan_nodes)}, resources: ${String(measured.resources)}`,
    `3D physics: ${String(measured.physics_3d_active_objects)} active bodies, ${String(measured.physics_3d_collision_pairs)} collision pairs, ${String(measured.physics_3d_islands)} islands`,
  );
  return lines.join('\n');
}

function averageAndWorst(summary: SampleSummary): string {
  return `average ${milliseconds(summary.average)}, worst ${milliseconds(summary.max)}`;
}

function milliseconds(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function megabytes(bytes: number): string {
  return `${(bytes / bytesPerMegabyte).toFixed(1)} MB`;
}

function describeOrphans(count: number): string {
  return count === 0 ? 'orphan nodes: 0' : `orphan nodes: ${String(count)} (nodes out of the tree that were never freed, often a leak)`;
}
