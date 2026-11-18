import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { GameOutputCursor } from '../../src/runtime/GameOutputCursor.js';
import { createGameGetPropertiesTool, createGameGetTreeTool, createGameSetPropertiesTool, createGameWaitTool } from '../../src/tools/gameInspectionTools.js';
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

  it('game_run says when the game runs without a window', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', { ...quietRun, windowless: true });

    const text = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({}));

    expect(text).toBe(
      [
        'The game is running res://levels/arena.tscn; it was ready after 850 ms.',
        'It runs without a window, so game_screenshot cannot show it; check it with game_get_properties, game_get_tree and node_get_bounds.',
        'No output yet.',
      ].join('\n'),
    );
  });

  it('game_run says when the game window did not get the size asked for', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', { ...quietRun, window_size: [1152, 648] });

    const text = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({ window_size: [1024, 768] }));

    expect(text).toContain(
      'The game window is 1152×648, not the 1024×768 asked for: the Game view of the editor sizes a game that it embeds, and keeps the asked size only in its Fixed size mode and when the view is large enough.',
    );
  });

  it('game_run stays quiet about a game window that got the size asked for', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', { ...quietRun, window_size: [1024, 768] });

    const text = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({ window_size: [1024, 768] }));

    expect(text).not.toContain('The game window is');
  });

  it('game_run asks the editor to stop the game at its first error', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', quietRun);

    await createGameRunTool(editor, new GameOutputCursor()).execute({ break_on_error: true });

    expect(editor.requests[0]?.params).toEqual({ scene: 'main', watch_ms: 1000, stop_after: false, break_on_error: true });
  });

  it('game_run passes a fixed frame rate and explains what it means', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', quietRun);

    const result = await createGameRunTool(editor, new GameOutputCursor()).execute({ fixed_fps: 60 });

    expect(editor.requests[0]?.params).toEqual({ scene: 'main', watch_ms: 1000, stop_after: false, fixed_fps: 60 });
    expect(textOf(result)).toBe(
      [
        'The game is running res://levels/arena.tscn; it was ready after 850 ms.',
        'Every frame advances the game by exactly 1/60 s, however long it takes, so wait and hold for physics frames, not milliseconds.',
        'No output yet.',
      ].join('\n'),
    );
  });

  it('game_run forwards debug drawing, game arguments, the window size and the locale', async () => {
    const editor = new FakeEditorGateway().respondTo('game.run', quietRun);

    await createGameRunTool(editor, new GameOutputCursor()).execute({
      debug_draw: ['collisions', 'navigation'],
      arguments: ['--level=3'],
      window_size: [1280, 720],
      locale: 'de',
    });

    expect(editor.requests[0]?.params).toEqual({
      scene: 'main',
      watch_ms: 1000,
      stop_after: false,
      debug_draw: ['collisions', 'navigation'],
      arguments: ['--level=3'],
      window_size: [1280, 720],
      locale: 'de',
    });
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

  it('game_run says when the game stopped in the debugger, before or after it was ready', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.run', { ...quietRun, outcome: 'paused', state: 'paused' })
      .respondTo('game.run', { ...quietRun, state: 'paused' });

    const beforeReady = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({}));
    const afterReady = textOf(await createGameRunTool(editor, new GameOutputCursor()).execute({}));

    expect(beforeReady).toBe(
      'The game stopped in the debugger before it was ready (res://levels/arena.tscn), at a breakpoint or on an error: debug_state shows where and why.\nNo output yet.',
    );
    expect(afterReady).toBe('The game is stopped in the debugger in res://levels/arena.tscn, at a breakpoint or on an error: debug_state shows where and why.\nNo output yet.');
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

  it('game_get_output says when the game is stopped in the debugger', async () => {
    const editor = new FakeEditorGateway().respondTo('game.get_output', { entries: [], more: false, next_after: 3, skipped: 0, last_seq: 3, state: 'paused' });

    const result = await createGameGetOutputTool(editor, new GameOutputCursor()).execute({});

    expect(textOf(result)).toBe('The game is stopped in the debugger; debug_state shows where and why.\nNo new output.');
  });

  it('game_stop reports what it did', async () => {
    const editor = new FakeEditorGateway().respondTo('game.stop', { was_running: true }).respondTo('game.stop', { was_running: false });

    expect(textOf(await createGameStopTool(editor).execute({}))).toBe('Stopped the game.');
    expect(textOf(await createGameStopTool(editor).execute({}))).toBe('The game was not running.');
  });

  it('loads the game tools that most sessions use up front', () => {
    const tools = createGameTools(new FakeEditorGateway(), new GameOutputCursor(), () => Buffer.alloc(0));

    expect(tools.map((tool) => [tool.name, tool.definition.alwaysLoad])).toEqual([
      ['game_run', true],
      ['game_stop', true],
      ['game_get_output', true],
      ['game_get_tree', false],
      ['game_get_properties', true],
      ['game_set_properties', false],
      ['game_wait', true],
      ['game_input', true],
      ['game_screenshot', false],
      ['game_pause', false],
      ['game_step', false],
      ['game_performance', false],
    ]);
  });

  it('game_get_tree draws the tree of the running game', async () => {
    const editor = new FakeEditorGateway().respondTo('game.get_tree', {
      scene: 'res://levels/arena.tscn',
      node_count: 3,
      truncated: false,
      root: { name: 'Arena', type: 'Node3D', child_count: 2, children: [{ name: 'Player', type: 'CharacterBody3D' }, { name: 'Bullet', type: 'Node3D' }] },
    });

    const text = textOf(await createGameGetTreeTool(editor).execute({ path: '.' }));

    expect(editor.requests[0]?.params).toEqual({ path: '.', max_depth: 8, max_nodes: 200 });
    expect(text).toBe(['The running game, current scene res://levels/arena.tscn', 'Arena: Node3D', '├─ Player: CharacterBody3D', '└─ Bullet: Node3D'].join('\n'));
  });

  it('game_get_tree lists the visible controls to read and click a menu', async () => {
    const editor = new FakeEditorGateway().respondTo('game.get_tree', {
      scene: 'res://levels/arena.tscn',
      total: 4,
      truncated: false,
      controls: [
        { path: 'Menu/Title', type: 'Label', rect: [40, 10, 160, 20], text: 'Paused', focused: false },
        { path: 'Menu/Resume', type: 'Button', rect: [40, 40, 160, 50], text: 'Resume', disabled: false, focused: true },
        { path: 'Menu/Quit', type: 'Button', rect: [40, 100, 160, 50], text: 'Quit', disabled: true, focused: false },
        { path: 'HUD/Health', type: 'ProgressBar', rect: [300, 10, 200, 20], value: 75, focused: false },
      ],
    });

    const text = textOf(await createGameGetTreeTool(editor).execute({ controls: true }));

    expect(editor.requests[0]?.params).toEqual({ max_depth: 8, max_nodes: 200, controls: true });
    expect(text).toBe(
      [
        'Visible controls of the running game, current scene res://levels/arena.tscn, with their rectangles [x, y, width, height] in game-view pixels:',
        'Menu/Title: Label "Paused" [40, 10, 160, 20]',
        'Menu/Resume: Button "Resume" [40, 40, 160, 50], focused',
        'Menu/Quit: Button "Quit" [40, 100, 160, 50], disabled',
        'HUD/Health: ProgressBar value 75 [300, 10, 200, 20]',
        'Click one with game_input, such as {"click": "Menu/Resume"}.',
      ].join('\n'),
    );
  });

  it('game_wait waits for a signal and shows its arguments', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.wait', { emitted: true, arguments: [2.5], physics_frames: 3, waited_ms: 50, paused: false, game_frame: 90 })
      .respondTo('game.wait', { emitted: false, physics_frames: 600, waited_ms: 10_000, paused: false, game_frame: 700 });

    const emitted = textOf(await createGameWaitTool(editor).execute({ signal: 'landed', node: 'Player' }));
    const missed = textOf(await createGameWaitTool(editor).execute({ signal: 'died', node: 'Enemy' }));

    expect(editor.requests[0]?.params).toEqual({ signal: 'landed', node: 'Player', timeout_ms: 10_000 });
    expect(emitted).toBe('Player emitted landed after 50 ms (3 physics frames) with [2.5].');
    expect(missed).toBe('Enemy did not emit died within 10000 ms.');
  });

  it('game_get_properties lists values, getters included', async () => {
    const editor = new FakeEditorGateway().respondTo('game.get_properties', {
      scene: 'res://levels/arena.tscn',
      path: 'Player',
      type: 'CharacterBody3D',
      properties: [
        { name: 'position', type: 'Vector3', value: 'Vector3(0, 1, -4.2)' },
        { name: 'is_on_floor()', type: 'bool', value: true },
      ],
    });

    const text = textOf(await createGameGetPropertiesTool(editor).execute({ path: 'Player', names: ['position', 'is_on_floor()'] }));

    expect(editor.requests[0]?.params).toEqual({ path: 'Player', names: ['position', 'is_on_floor()'], include_defaults: false });
    expect(text).toBe(['Player (CharacterBody3D) in the running game', 'position = Vector3(0, 1, -4.2)  [Vector3]', 'is_on_floor() = true  [bool]'].join('\n'));
  });

  it('game_set_properties says the change lasts only while the game runs', async () => {
    const editor = new FakeEditorGateway().respondTo('game.set_properties', {
      scene: 'res://levels/arena.tscn',
      path: 'Player',
      applied: ['position'],
      rejected: [],
      not_applied: [],
    });

    const text = textOf(await createGameSetPropertiesTool(editor).execute({ path: 'Player', properties: { position: [0, 5, 0] } }));

    expect(text).toBe('Updated Player in the running game. The change lasts until the game stops; scene files stay as they are.\nApplied: position');
  });

  it('game_set_properties points to window_size of game_run when the game window keeps its size', async () => {
    const editor = new FakeEditorGateway().respondTo('game.set_properties', {
      scene: 'res://levels/arena.tscn',
      path: '/root',
      applied: [],
      rejected: [],
      not_applied: [{ name: 'size', expected: 'Vector2i(1024, 768)', actual: 'Vector2i(1152, 648)' }],
    });

    const result = await createGameSetPropertiesTool(editor).execute({ path: '/root', properties: { size: [1024, 768] } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      [
        'No property of /root in the running game took the requested value.',
        'Not applied, the engine kept another value:',
        '- size: wanted "Vector2i(1024, 768)", got "Vector2i(1152, 648)"',
        'The game window keeps the size it started with: to try another size, run the game again with window_size in game_run, such as [1024, 768].',
      ].join('\n'),
    );
  });

  it('game_wait reports a condition that became true', async () => {
    const editor = new FakeEditorGateway().respondTo('game.wait', { met: true, value: true, physics_frames: 42, waited_ms: 700, paused: false, game_frame: 960 });

    const result = await createGameWaitTool(editor).execute({ condition: 'is_on_floor()', node: 'Player' });

    expect(editor.requests[0]?.params).toEqual({ condition: 'is_on_floor()', node: 'Player', timeout_ms: 10000 });
    expect(editor.requests[0]?.options?.timeoutMs).toBeGreaterThan(65_000);
    expect(textOf(result)).toBe('"is_on_floor()" became true on Player after 700 ms (42 physics frames).');
  });

  it('game_wait reports a condition that stayed false', async () => {
    const editor = new FakeEditorGateway().respondTo('game.wait', { met: false, value: 'Vector3(0, 3.5, 0)', physics_frames: 600, waited_ms: 10000, paused: false, game_frame: 1560 });

    const text = textOf(await createGameWaitTool(editor).execute({ condition: 'position' }));

    expect(text).toBe('"position" was still not true on the scene root after 10000 ms; its last value was Vector3(0, 3.5, 0).');
  });

  it('game_wait waits for frames and time', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.wait', { physics_frames: 60, waited_ms: 1001, paused: false, game_frame: 60 })
      .respondTo('game.wait', { frames: 2, waited_ms: 33, paused: false, game_frame: 62 })
      .respondTo('game.wait', { waited_ms: 250, paused: false, game_frame: 77 });

    expect(textOf(await createGameWaitTool(editor).execute({ physics_frames: 60 }))).toBe('Waited 60 physics frames (1001 ms).');
    expect(textOf(await createGameWaitTool(editor).execute({ frames: 2 }))).toBe('Waited 2 frames (33 ms).');
    expect(textOf(await createGameWaitTool(editor).execute({ ms: 250 }))).toBe('Waited 250 ms.');
  });

  it('game_wait says that it played the paused game and paused it again', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.wait', { met: true, value: true, physics_frames: 5, waited_ms: 90, paused: true, game_frame: 37 })
      .respondTo('game.wait', { physics_frames: 60, waited_ms: 1001, paused: true, game_frame: 97 });

    const condition = textOf(await createGameWaitTool(editor).execute({ condition: 'ticks >= 25', node: 'Faller' }));
    const frames = textOf(await createGameWaitTool(editor).execute({ physics_frames: 60 }));

    expect(condition).toBe('"ticks >= 25" became true on Faller after 90 ms (5 physics frames). The game is paused again at its physics frame 37.');
    expect(frames).toBe('Waited 60 physics frames (1001 ms). The game is paused again at its physics frame 97.');
  });
});

