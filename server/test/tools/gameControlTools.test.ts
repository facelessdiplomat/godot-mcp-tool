import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createGamePauseTool, createGamePerformanceTool, createGameStepTool } from '../../src/tools/gameControlTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const measurement = {
  scene: 'res://levels/arena.tscn',
  frames: 60,
  paused: false,
  headless: false,
  frame_ms: { average: 16.71, p95: 17.4, max: 21.3 },
  process_ms: { average: 0.42, p95: 0.6, max: 1.2 },
  physics_ms: { average: 0.9, p95: 1.1, max: 2 },
  draw_calls: { average: 120, p95: 130, max: 140 },
  primitives: { average: 45_000, p95: 46_000, max: 47_000 },
  drawn_objects: { average: 80, p95: 82, max: 85 },
  memory_bytes: 99_800_000,
  memory_peak_bytes: 105_000_000,
  video_memory_bytes: 210_500_000,
  objects: 15_200,
  nodes: 312,
  orphan_nodes: 0,
  resources: 640,
  physics_3d_active_objects: 12,
  physics_3d_collision_pairs: 30,
  physics_3d_islands: 4,
};

describe('game control tools', () => {
  it('game_pause pauses the game and resumes it', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.pause', { paused: true, was_paused: false, game_frame: 812 })
      .respondTo('game.pause', { paused: false, was_paused: true, game_frame: 812 })
      .respondTo('game.pause', { paused: true, was_paused: true, game_frame: 812 });

    const paused = await createGamePauseTool(editor).execute({});
    const resumed = await createGamePauseTool(editor).execute({ paused: false });
    const again = await createGamePauseTool(editor).execute({});

    expect(editor.requests.map((request) => request.params)).toEqual([{ paused: true }, { paused: false }, { paused: true }]);
    expect(textOf(paused)).toBe(
      'Paused the game at its physics frame 812. Read it with game_get_properties or game_screenshot. game_step, game_input and game_wait play it on by exact physics frames and pause it again; game_pause with paused: false resumes it.',
    );
    expect(textOf(resumed)).toBe('Resumed the game at its physics frame 812.');
    expect(textOf(again)).toBe('The game was paused already, at its physics frame 812.');
  });

  it('game_step advances the game by exact physics frames and keeps it paused', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.step', { physics_frames: 5, was_paused: true, game_frame: 817 })
      .respondTo('game.step', { physics_frames: 1, was_paused: false, game_frame: 900 });

    const stepped = await createGameStepTool(editor).execute({ physics_frames: 5 });
    const fromRunning = await createGameStepTool(editor).execute({});

    expect(editor.requests.map((request) => request.params)).toEqual([{ physics_frames: 5 }, { physics_frames: 1 }]);
    expect(textOf(stepped)).toBe('Advanced the game by 5 physics frames to its physics frame 817; it stays paused.');
    expect(textOf(fromRunning)).toBe('Let the running game advance 1 more physics frame and paused it at its physics frame 900.');
  });

  it('game_performance summarizes the measured frames', async () => {
    const editor = new FakeEditorGateway().respondTo('game.performance', measurement);

    const result = await createGamePerformanceTool(editor).execute({});

    expect(editor.requests[0]?.params).toEqual({ frames: 60 });
    expect(textOf(result)).toBe(
      [
        'Performance of the running game (res://levels/arena.tscn) over 60 frames:',
        'Frame time: average 16.7 ms (60 FPS), 95th percentile 17.4 ms, worst 21.3 ms',
        'Process: average 0.4 ms, worst 1.2 ms; physics: average 0.9 ms, worst 2.0 ms',
        'Rendering per frame: 120 draw calls, 45000 primitives, 80 objects on average',
        'Memory: 95.2 MB, peak 100.1 MB; video memory 200.7 MB',
        'Objects: 15200, nodes: 312, orphan nodes: 0, resources: 640',
        '3D physics: 12 active bodies, 30 collision pairs, 4 islands',
      ].join('\n'),
    );
  });

  it('game_performance points out orphan nodes, a paused game and a game without a window', async () => {
    const editor = new FakeEditorGateway().respondTo('game.performance', { ...measurement, paused: true, headless: true, orphan_nodes: 25 });

    const text = textOf(await createGamePerformanceTool(editor).execute({ frames: 10 }));

    expect(text).toContain('The game is paused, so these numbers show an idle game.');
    expect(text).toContain('Rendering: none, the game runs without a window');
    expect(text).toContain('orphan nodes: 25 (nodes out of the tree that were never freed, often a leak)');
  });

  it('game_performance names the functions that took the most script time and the custom monitors', async () => {
    const editor = new FakeEditorGateway().respondTo('game.performance', {
      ...measurement,
      custom_monitors: { 'game/enemies': { average: 12, p95: 12, max: 14 } },
      profiled: true,
      functions: [
        { script: 'res://enemy.gd', line: 42, function: 'Enemy.find_path', calls: 1200, self_ms: 85.3, total_ms: 90.1 },
        { script: 'res://world.gd', line: 10, function: '_process', calls: 60, self_ms: 2, total_ms: 92.1 },
      ],
    });

    const text = textOf(await createGamePerformanceTool(editor).execute({}));

    expect(text.split('\n').slice(-5)).toEqual([
      'Custom monitors: game/enemies average 12, worst 14',
      'Functions that took the most script time of their own over these frames:',
      '- Enemy.find_path (res://enemy.gd:42): 85.3 ms in 1200 calls, 90.1 ms with what it calls',
      '- _process (res://world.gd:10): 2.0 ms in 60 calls, 92.1 ms with what it calls',
      'Look at the first one before the others: its own code takes the time, not the functions it calls.',
    ]);
  });

  it('game_performance says when it could not time the functions', async () => {
    const editor = new FakeEditorGateway().respondTo('game.performance', { ...measurement, profiled: false, functions: [] });

    const text = textOf(await createGamePerformanceTool(editor).execute({}));

    expect(text.split('\n').at(-1)).toBe('Function times: not measured; they need a game started from the editor, whose debugger profiles its scripts.');
  });
});

