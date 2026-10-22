import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { GameOutputCursor } from '../../src/runtime/GameOutputCursor.js';
import { createGameGetOutputTool, createGameRunTool, createGameStopTool, createGameTools } from '../../src/tools/gameTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const quietRun = {
  scene: 'res://levels/arena.tscn',
  outcome: 'ready',
  state: 'running',
  startup_ms: 850,
  output: [],
  more_output: false,
  next_after: 7,
  saved_scenes: [],
  saved_scripts: [],
};

describe('game tools', () => {
  it('game_run starts the main scene and watches it for a second', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', quietRun);

    const result = await createGameRunTool(editor, new GameOutputCursor()).execute({});

    expect(editor.requests[0]?.params).toEqual({ scene: 'main', watch_ms: 1000, stop_after: false });
    expect(textOf(result)).toBe('The game is running res://levels/arena.tscn; it was ready after 850 ms.\nNo output yet.');
    expect(createGameRunTool(editor, new GameOutputCursor()).definition.showsErrors).toBe(true);
  });

  it('game_run runs for a given time and stops', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', {
      ...quietRun,
      state: 'stopped',
      output: [{ seq: 6, source: 'game', level: 'info', message: 'Arena loaded' }],
    });

    const result = await createGameRunTool(editor, new GameOutputCursor()).execute({ scene: 'current', duration_ms: 3000 });

    expect(editor.requests[0]?.params).toEqual({ scene: 'current', watch_ms: 3000, stop_after: true });
    expect(editor.requests[0]?.options?.timeoutMs).toBeGreaterThan(3000 + 30_000);
    expect(textOf(result)).toBe('The game ran res://levels/arena.tscn for 3000 ms after it was ready and was stopped.\nOutput:\nArena loaded');
  });

  it('game_run explains a game that stopped during startup', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', {
      ...quietRun,
      outcome: 'stopped',
      state: 'stopped',
      output: [{ seq: 6, source: 'game', level: 'error', message: 'Parse Error: Unexpected "Indent".', location: 'res://main.gd:4' }],
    });

    const text = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({}));

    expect(text).toBe(
      ['The game stopped before it was ready (res://levels/arena.tscn).', 'Output:', 'ERROR res://main.gd:4: Parse Error: Unexpected "Indent".'].join('\n'),
    );
  });

  it('game_run tells what running saved and when there is more output', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', {
      ...quietRun,
      output: [{ seq: 6, source: 'game', level: 'info', message: 'Arena loaded' }],
      more_output: true,
      saved_scenes: ['res://levels/arena.tscn'],
      saved_scripts: ['res://player.gd'],
    });

    const text = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({}));

    expect(text).toContain('Running saved res://levels/arena.tscn, res://player.gd first, as the editor does.');
    expect(text).toContain('More output follows; read it with game_get_output.');
  });

  it('game_get_output continues where the last game_run stopped', async () => {
    const cursor = new GameOutputCursor();
    const editor = new FakeEditorGateway()
      .respondTo('game.run', quietRun)
      .respondTo('game.get_output', {
        entries: [{ seq: 8, source: 'game', level: 'info', message: 'Wave 1' }],
        more: false,
        next_after: 8,
        skipped: 0,
        last_seq: 8,
        state: 'running',
      })
      .respondTo('game.get_output', { entries: [], more: false, next_after: 8, skipped: 0, last_seq: 8, state: 'running' });

    await createGameRunTool(editor, cursor).execute({});
    const first = textOf(await createGameGetOutputTool(editor, cursor).execute({}));
    const second = textOf(await createGameGetOutputTool(editor, cursor).execute({}));

    expect(editor.requests[1]?.params).toEqual({ after: 7, limit: 100 });
    expect(editor.requests[2]?.params).toEqual({ after: 8, limit: 100 });
    expect(first).toBe('The game is running.\nWave 1');
    expect(second).toBe('The game is running.\nNo new output.');
  });

  it('game_get_output can read the run from its start and filter levels', async () => {
    const editor = new FakeEditorGateway().respondTo('game.get_output', {
      entries: [],
      more: true,
      next_after: 30,
      skipped: 4,
      last_seq: 90,
      state: 'stopped',
    });

    const text = textOf(await createGameGetOutputTool(editor, new GameOutputCursor()).execute({ levels: ['error'], from_start: true, max_entries: 20 }));

    expect(editor.requests[0]?.params).toEqual({ after: -1, levels: ['error'], limit: 20 });
    expect(text).toBe(
      ['The game is not running.', '4 older entries no longer fit in the buffer.', 'No new output.', 'More output follows; call game_get_output again.'].join('\n'),
    );
  });

  it('game_stop reports what it did', async () => {
    const editor = new FakeEditorGateway().respondTo('game.stop', { was_running: true }).respondTo('game.stop', { was_running: false });

    expect(textOf(await createGameStopTool(editor).execute({}))).toBe('Stopped the game.');
    expect(textOf(await createGameStopTool(editor).execute({}))).toBe('The game was not running.');
  });

  it('loads game_run and game_get_output up front', () => {
    const tools = createGameTools(new FakeEditorGateway(), new GameOutputCursor());

    expect(tools.map((tool) => [tool.name, tool.definition.alwaysLoad])).toEqual([
      ['game_run', true],
      ['game_stop', false],
      ['game_get_output', true],
    ]);
  });
});

