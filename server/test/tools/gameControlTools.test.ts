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
      .respondTo('game.pause', { paused: true, was_paused: false, physics_frame: 812 })
      .respondTo('game.pause', { paused: false, was_paused: true, physics_frame: 812 })
      .respondTo('game.pause', { paused: true, was_paused: true, physics_frame: 812 });

    const paused = await createGamePauseTool(editor).execute({});
    const resumed = await createGamePauseTool(editor).execute({ paused: false });
    const again = await createGamePauseTool(editor).execute({});

    expect(editor.requests.map((request) => request.params)).toEqual([{ paused: true }, { paused: false }, { paused: true }]);
    expect(textOf(paused)).toBe(
      'Paused the game at physics frame 812. Read it with game_get_properties or game_screenshot, advance it with game_step, and resume it with game_pause and paused: false.',
    );
    expect(textOf(resumed)).toBe('Resumed the game at physics frame 812.');
    expect(textOf(again)).toBe('The game was paused already, at physics frame 812.');
  });

  it('game_step advances the game by exact physics frames and keeps it paused', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.step', { physics_frames: 5, was_paused: true, physics_frame: 817 })
      .respondTo('game.step', { physics_frames: 1, was_paused: false, physics_frame: 900 });

    const stepped = await createGameStepTool(editor).execute({ physics_frames: 5 });
    const fromRunning = await createGameStepTool(editor).execute({});

    expect(editor.requests.map((request) => request.params)).toEqual([{ physics_frames: 5 }, { physics_frames: 1 }]);
    expect(textOf(stepped)).toBe('Advanced the game by 5 physics frames to physics frame 817; it stays paused.');
    expect(textOf(fromRunning)).toBe('Let the running game advance 1 more physics frame and paused it at physics frame 900.');
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
});
