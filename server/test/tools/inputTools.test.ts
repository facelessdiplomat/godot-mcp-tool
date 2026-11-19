import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createGameInputTool, createGameRecordInputTool, createInputMapGetTool, createInputMapSetTool } from '../../src/tools/inputTools.js';
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

  it('game_input presses gamepad buttons, tilts sticks and says how to let go of them', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 2,
      waited_ms: 50,
      released: [],
      held: ['joypad_motion left_y', 'joypad_button right_shoulder'],
      physics_frames: 3,
      paused: false,
      game_frame: 90,
    });
    const steps = [
      { joypad_button: 'a', physics_frames: 3 },
      { joypad_motion: 'left_y', value: -1, state: 'down' as const },
      { joypad_button: 'right_shoulder', state: 'down' as const },
    ];

    const text = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps, release_at_end: false }));

    expect(editor.requests[0]?.params).toEqual({ steps, release_at_end: false, screenshot: false });
    expect(text).toContain('Still held: joypad_motion left_y, joypad_button right_shoulder. Release it with {"joypad_motion": "left_y", "state": "up"}.');
  });

  it('game_input refuses a stick tilted beyond its range', async () => {
    const result = await createGameInputTool(new FakeEditorGateway(), () => Buffer.alloc(0)).execute({ steps: [{ joypad_motion: 'left_x', value: 2 }] });

    expect(result.isError).toBe(true);
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

  it('game_input forwards wheel, drag, touch, Control clicks and screenshot steps', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', { steps: 7, waited_ms: 90, released: [], held: [], physics_frames: 6, paused: false, game_frame: 50 });
    const steps = [
      { wheel: 'down' as const, at: [20, 30], clicks: 2 },
      { click: [10, 10], state: 'down' as const },
      { mouse_motion: [30, 0] },
      { click: [40, 10], state: 'up' as const },
      { click: 'Menu/Resume' },
      { touch: [50, 60], finger: 1, state: 'down' as const },
      { touch_drag: [20, 0], finger: 1 },
      { screenshot: true as const },
    ];

    await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps });

    expect(editor.requests[0]?.params).toEqual({ steps, release_at_end: true, screenshot: false });
  });

  it('game_input says where it clicked a Control and where it stopped', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 3,
      waited_ms: 60,
      released: [],
      held: [],
      physics_frames: 4,
      paused: false,
      game_frame: 80,
      clicked: [{ step: 1, path: 'Menu/Resume', at: [640, 360] }],
      failed_step: { step: 2, error: 'Menu/Quit is not visible, so it cannot be clicked' },
    });

    const text = textOf(await createGameInputTool(editor, () => Buffer.alloc(0)).execute({ steps: [{ click: 'Menu/Resume' }, { click: 'Menu/Quit' }, { action: 'jump' }] }));

    expect(text).toBe(
      [
        'Played 3 input steps in 60 ms (4 physics frames).',
        'Step 1 clicked Menu/Resume at [640, 360].',
        'Stopped at step 2: Menu/Quit is not visible, so it cannot be clicked. The later steps did not run.',
      ].join('\n'),
    );
  });

  it('game_input shows the screenshots of several moments as one labelled image', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 3,
      waited_ms: 70,
      released: [],
      held: [],
      physics_frames: 10,
      paused: false,
      game_frame: 60,
      screenshot: {
        path: '/captures/moments-1-001.png',
        width: 1280,
        height: 368,
        original_width: 1280,
        original_height: 368,
        scene: 'res://levels/arena.tscn',
        views: [],
        moments: ['step 1, frame 0', 'step 3, frame 10', 'end, frame 10'],
      },
    });

    const result = await createGameInputTool(editor, () => Buffer.from('png')).execute({ steps: [{ screenshot: true }, { wait_physics_frames: 10 }, { screenshot: true }], screenshot: true });

    expect(result.content[1]).toEqual({
      type: 'text',
      text: [
        'Played 3 input steps in 70 ms (10 physics frames).',
        'Screenshots of the running game (res://levels/arena.tscn) at step 1, frame 0; step 3, frame 10; end, frame 10, in one labelled image, 1280×368.',
        'Saved to /captures/moments-1-001.png',
      ].join('\n'),
    });
  });

  it('game_input tells how to release a held mouse button or finger', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', { steps: 2, waited_ms: 10, released: [], held: ['mouse right', 'touch 1'], physics_frames: 0, paused: false, game_frame: 5 });

    const text = textOf(
      await createGameInputTool(editor, () => Buffer.alloc(0)).execute({
        steps: [{ click: [5, 5], button: 'right', state: 'down' }, { touch: [5, 5], finger: 1, state: 'down' }],
        release_at_end: false,
      }),
    );

    expect(text).toContain('Release it with {"click": [x, y], "button": "right", "state": "up"}.');
  });

  it('game_input lists the signals emitted while it played', async () => {
    const editor = new FakeEditorGateway().respondTo('game.input', {
      steps: 2,
      waited_ms: 80,
      released: [],
      held: [],
      physics_frames: 40,
      paused: false,
      game_frame: 100,
      signals: [
        { node: 'Player', signal: 'landed', emissions: [{ step: 2, physics_frames: 38, arguments: [] }] },
        { node: 'Player', signal: 'died', emissions: [] },
      ],
    });

    const text = textOf(
      await createGameInputTool(editor, () => Buffer.alloc(0)).execute({
        steps: [{ action: 'jump' }, { wait_physics_frames: 38 }],
        watch_signals: [
          { node: 'Player', signal: 'landed' },
          { node: 'Player', signal: 'died' },
        ],
      }),
    );

    expect(editor.requests[0]?.params).toMatchObject({ watch_signals: [{ node: 'Player', signal: 'landed' }, { node: 'Player', signal: 'died' }] });
    expect(text).toContain('Player.landed was emitted 1 time: in step 2 after 38 physics frames.');
    expect(text).toContain('Player.died was not emitted.');
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

  it('game_record_input starts recording the person who plays', async () => {
    const game = new FakeEditorGateway().respondTo('game.record_input', { recording: true, start_frame: 120, restarted: false });

    const text = textOf(await createGameRecordInputTool(game).execute({ state: 'start' }));

    expect(game.requests[0]).toMatchObject({ method: 'game.record_input', params: { state: 'start' } });
    expect(text).toBe(
      'Recording the input of the running game from its physics frame 120. Let the person play, then call game_record_input with state "stop". Input that game_input plays is not recorded.',
    );
  });

  it('game_record_input returns a short recording as steps of game_input, with what a replay needs', async () => {
    const steps = [{ wait_physics_frames: 30 }, { action: 'move_forward', state: 'down' }, { wait_physics_frames: 12 }, { action: 'jump', physics_frames: 4 }];
    const game = new FakeEditorGateway().respondTo('game.record_input', { start_frame: 120, stop_frame: 300, physics_frames: 180, events: 9, count: 4, steps });

    const text = textOf(await createGameRecordInputTool(game).execute({ state: 'stop' }));

    expect(text).toBe(
      [
        'Recorded 4 steps from 9 input events over 180 physics frames (frames 120 to 300).',
        'To replay them, start from the same state, such as game_run of the same scene with fixed_fps: 60 for a frame-exact run, then pass the steps to game_input; a test can play them the same way.',
        '[',
        '  {"wait_physics_frames":30},',
        '  {"action":"move_forward","state":"down"},',
        '  {"wait_physics_frames":12},',
        '  {"action":"jump","physics_frames":4}',
        ']',
      ].join('\n'),
    );
  });

  it('game_record_input points to the file of a long recording and shows its first steps', async () => {
    const firstSteps = [{ wait_physics_frames: 3 }, { mouse_motion: [12, -4] }];
    const game = new FakeEditorGateway().respondTo('game.record_input', {
      start_frame: 0,
      stop_frame: 4000,
      physics_frames: 4000,
      events: 900,
      count: 640,
      path: '/game/.godot/godot_mcp_tool/recordings/recording-1795000000.json',
      first_steps: firstSteps,
    });

    const text = textOf(await createGameRecordInputTool(game).execute({ state: 'stop' }));

    expect(text).toContain('Recorded 640 steps from 900 input events over 4000 physics frames (frames 0 to 4000).');
    expect(text).toContain(
      'One game_input call takes up to 200 steps, so the steps are in /game/.godot/godot_mcp_tool/recordings/recording-1795000000.json, a JSON list. Replay them in calls of up to 200 steps while game_pause holds the game, so that no frame passes between the calls. The first 2:',
    );
    expect(text).toContain('  {"mouse_motion":[12,-4]}');
  });

  it('game_record_input says when nothing was recorded', async () => {
    const game = new FakeEditorGateway().respondTo('game.record_input', { start_frame: 10, stop_frame: 70, physics_frames: 60, events: 0, count: 0, steps: [] });

    const text = textOf(await createGameRecordInputTool(game).execute({ state: 'stop' }));

    expect(text).toBe('No input was recorded in 60 physics frames (frames 10 to 70). The person plays in the game window, which needs the focus; input that game_input plays is not recorded.');
  });
});
