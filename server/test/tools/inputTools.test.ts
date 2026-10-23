import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createGameInputTool, createInputMapGetTool, createInputMapSetTool } from '../../src/tools/inputTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const keyW = { type: 'key', key: 'W', text: 'W' };
const keyUp = { type: 'key', key: 'Up', text: 'Up' };
const keySpace = { type: 'key', key: 'Space', text: 'Space' };
const keyEnter = { type: 'key', key: 'Enter', text: 'Enter' };

describe('input tools', () => {
  it('input_map_get lists the actions with their events', async () => {
    const editor = new FakeEditorGateway().respondTo('input_map.get', {
      actions: [
        { name: 'move_forward', deadzone: 0.2, events: [keyW, keyUp] },
        { name: 'interact', deadzone: 0.5, events: [] },
      ],
      unknown: [{ name: 'jmp', reason: 'There is no input action "jmp". Similar: jump.' }],
    });

    const text = textOf(await createInputMapGetTool(editor).execute({ actions: ['move_forward', 'interact', 'jmp'] }));

    expect(editor.requests[0]?.params).toEqual({ actions: ['move_forward', 'interact', 'jmp'], include_builtin: false });
    expect(text).toBe(
      ['move_forward: W, Up', 'interact: no events (deadzone 0.5)', 'jmp: There is no input action "jmp". Similar: jump.'].join('\n'),
    );
  });

  it('input_map_get explains a project without actions', async () => {
    const editor = new FakeEditorGateway().respondTo('input_map.get', { actions: [], unknown: [] });

    const text = textOf(await createInputMapGetTool(editor).execute({}));

    expect(text).toContain('The project has no input actions of its own yet');
  });

  it('input_map_set reports new, changed, removed and rejected actions', async () => {
    const editor = new FakeEditorGateway().respondTo('input_map.set', {
      applied: ['move_forward', 'jump'],
      removed: ['crouch'],
      rejected: [{ name: 'dance', reason: 'There is no key named "Spce". Similar: Space.' }],
      previous: { move_forward: null, jump: [keyEnter], crouch: [{ type: 'key', key: 'C', text: 'C' }] },
      actions: [
        { name: 'move_forward', deadzone: 0.2, events: [keyW, keyUp] },
        { name: 'jump', deadzone: 0.2, events: [keySpace] },
      ],
    });

    const result = await createInputMapSetTool(editor).execute({ actions: { move_forward: ['W', 'Up'], jump: ['Space'], crouch: null, dance: ['Spce'] } });

    expect(editor.requests[0]?.params).toEqual({ actions: { move_forward: ['W', 'Up'], jump: ['Space'], crouch: null, dance: ['Spce'] } });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Saved project.godot.',
        'move_forward: W, Up (new)',
        'jump: Space (was Enter)',
        'Removed crouch (was C)',
        'Rejected:',
        '- dance: There is no key named "Spce". Similar: Space.',
        'A game that is already running keeps its old actions until it starts again.',
      ].join('\n'),
    );
  });

  it('input_map_set fails when nothing changed', async () => {
    const editor = new FakeEditorGateway().respondTo('input_map.set', {
      applied: [],
      removed: [],
      rejected: [{ name: 'dance', reason: 'There is no key named "Spce". Similar: Space.' }],
      previous: {},
      actions: [],
    });

    const result = await createInputMapSetTool(editor).execute({ actions: { dance: ['Spce'] } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('project.godot was not changed.');
  });

  it('game_input plays the steps and says what is still held', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.input', { steps: 3, waited_ms: 1240, released: ['move_forward'], held: [], physics_frames: 74, paused: false, game_frame: 300 })
      .respondTo('game.input', { steps: 1, waited_ms: 33, released: [], held: ['jump'], physics_frames: 0, paused: false, game_frame: 300 });

    const first = textOf(
      await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps: [{ action: 'move_forward', state: 'down' }, { wait_ms: 1000 }, { action: 'jump' }] }),
    );
    const second = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps: [{ action: 'jump', state: 'down' }], release_at_end: false }));

    expect(editor.requests[0]?.params).toEqual({
      steps: [{ action: 'move_forward', state: 'down' }, { wait_ms: 1000 }, { action: 'jump' }],
      release_at_end: true,
      screenshot: false,
    });
    expect(editor.requests[0]?.options?.timeoutMs).toBeGreaterThan(1000 + 15_000);
    expect(first).toBe('Played 3 input steps in 1240 ms (74 physics frames).\nReleased at the end: move_forward.');
    expect(second).toBe('Played 1 input step in 33 ms (0 physics frames).\nStill held: jump. Release it with {"action": "jump", "state": "up"}.');
  });

  it('game_input tells how to release a held key', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', { steps: 1, waited_ms: 16, released: [], held: ['key W'], physics_frames: 1, paused: false, game_frame: 5 });

    const text = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps: [{ key: 'W', state: 'down' }], release_at_end: false }));

    expect(text).toContain('Release it with {"key": "W", "state": "up"}.');
  });

  it('game_input refuses steps with unknown fields', async () => {
    const result = await createGameInputTool(new FakeEditorGateway(), () => Buffer.alloc(0)).execute({ steps: [{ action: 'jump', hold: 5 }] } as never);

    expect(result.isError).toBe(true);
  });

  it('game_input returns a screenshot taken right after the last step', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 1,
      waited_ms: 40,
      released: [],
      held: [],
      physics_frames: 2,
      paused: false,
      game_frame: 42,
      screenshot: {
        path: '/captures/game-1-001.png',
        width: 1152,
        height: 648,
        original_width: 1152,
        original_height: 648,
        scene: 'res://levels/arena.tscn',
        views: [],
      },
    });

    const result = await createGameInputTool(editor, () => Buffer.from('png')).execute({ steps: [{ action: 'jump' }], screenshot: true });

    expect(editor.requests[0]?.params).toEqual({ steps: [{ action: 'jump' }], release_at_end: true, screenshot: true });
    expect(result.content[0]).toEqual({ type: 'image', data: Buffer.from('png').toString('base64'), mimeType: 'image/png' });
    expect(result.content[1]).toEqual({
      type: 'text',
      text: 'Played 1 input step in 40 ms (2 physics frames).\nScreenshot of the running game (res://levels/arena.tscn), 1152×648.\nSaved to /captures/game-1-001.png',
    });
  });

  it('game_input explains a screenshot it could not take', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 1,
      waited_ms: 40,
      released: [],
      held: [],
      physics_frames: 2,
      paused: false,
      game_frame: 42,
      screenshot_error: 'The game runs without a window (headless), so it cannot render a screenshot',
    });

    const result = await createGameInputTool(editor, () => Buffer.from('png')).execute({ steps: [{ action: 'jump' }], screenshot: true });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe('Played 1 input step in 40 ms (2 physics frames).\nNo screenshot: The game runs without a window (headless), so it cannot render a screenshot');
  });

  it('game_input reads nodes at moments of the input', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 3,
      waited_ms: 170,
      released: [],
      held: [],
      physics_frames: 10,
      paused: false,
      game_frame: 400,
      reads: [
        {
          step: 3,
          physics_frames: 10,
          scene: 'res://levels/arena.tscn',
          path: 'Player',
          type: 'CharacterBody3D',
          properties: [
            { name: 'velocity', type: 'Vector3', value: 'Vector3(0, 3.03, 0)' },
            { name: 'is_on_floor()', type: 'bool', value: false },
          ],
        },
        { step: 4, physics_frames: 10, path: 'Enemy', error: 'Node "Enemy" not found. Similar: Enemies.' },
      ],
    });
    const steps = [{ key: 'Space', physics_frames: 1 }, { wait_physics_frames: 9 }, { read: 'Player', names: ['velocity', 'is_on_floor()'] }, { read: 'Enemy', names: ['position'] }];

    const text = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps }));

    expect(editor.requests[0]?.params).toEqual({ steps, release_at_end: true, screenshot: false });
    expect(text).toBe(
      [
        'Played 3 input steps in 170 ms (10 physics frames).',
        'Step 3, after 10 physics frames: Player (CharacterBody3D)',
        'velocity = Vector3(0, 3.03, 0)  [Vector3]',
        'is_on_floor() = false  [bool]',
        'Step 4, after 10 physics frames: could not read Enemy: Node "Enemy" not found. Similar: Enemies.',
      ].join('\n'),
    );
  });

  it('game_input refuses a read step without names', async () => {
    const result = await createGameInputTool(new FakeEditorGateway(), () => Buffer.alloc(0)).execute({ steps: [{ read: 'Player' }] } as never);

    expect(result.isError).toBe(true);
  });

  it('game_input says how far it played a paused game', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('game.input', { steps: 1, waited_ms: 20, released: ['key Space'], held: [], physics_frames: 1, paused: true, game_frame: 812 })
      .respondTo('game.input', { steps: 1, waited_ms: 0, released: [], held: ['key Space'], physics_frames: 0, paused: true, game_frame: 812 });

    const played = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps: [{ key: 'Space', physics_frames: 1 }] }));
    const queued = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps: [{ key: 'Space', state: 'down' }], release_at_end: false }));

    expect(played).toBe(
      [
        'Played 1 input step in 20 ms (1 physics frame).',
        'Released at the end: key Space.',
        'The game advanced 1 physics frame and is paused again at its physics frame 812.',
      ].join('\n'),
    );
    expect(queued).toBe(
      [
        'Played 1 input step in 0 ms (0 physics frames).',
        'Still held: key Space. Release it with {"key": "Space", "state": "up"}.',
        'The game is paused, so this input reaches it in the next frame that game_step, game_wait or game_input plays.',
      ].join('\n'),
    );
  });
});
