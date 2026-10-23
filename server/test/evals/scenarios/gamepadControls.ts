import { checked, gameVector, horizontalDistance, type Scenario, vectorIn } from '../Scenario.js';
import { arenaScene, buildPrototype, keyboardActions } from './fixtures.js';

const stick = (axis: string, direction: number): Readonly<Record<string, unknown>> => ({ type: 'joypad_motion', axis, direction });

export const gamepadControls: Scenario = {
  name: 'gamepad-controls',
  request: 'Let me play with a gamepad too: the left stick moves the player and the A button jumps.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools);
  },
  async solve({ tools }) {
    await tools.call('input_map_set', {
      actions: {
        move_forward: [...keyboardActions.move_forward, stick('left_y', -1)],
        move_back: [...keyboardActions.move_back, stick('left_y', 1)],
        move_left: [...keyboardActions.move_left, stick('left_x', -1)],
        move_right: [...keyboardActions.move_right, stick('left_x', 1)],
        jump: [...keyboardActions.jump, { type: 'joypad_button', button: 'a' }],
      },
    });
  },
  async check({ tools }) {
    const inputMap = await tools.call('input_map_get', {});
    const lineOf = (action: string): string => inputMap.text.split('\n').find((line) => line.trim().startsWith(`${action}:`)) ?? '';
    const checks = ['move_forward', 'move_back', 'move_left', 'move_right'].map((action) =>
      checked(`${action} has a stick direction`, /joypad|stick/i.test(lineOf(action)) && /W|S|A|D/.test(lineOf(action)), lineOf(action).trim()),
    );
    checks.push(checked('jump has the A button and keeps Space', /joypad a|button a|\ba\b.*joypad|joypad.*\ba\b/i.test(lineOf('jump')) && /Space/.test(lineOf('jump')), lineOf('jump').trim()));
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 30 });
    const start = await gameVector(tools, 'Player', 'global_position');
    await tools.call('game_input', { steps: [{ key: 'W', ms: 1000 }] });
    const after = await gameVector(tools, 'Player', 'global_position');
    const distance = start === undefined || after === undefined ? 0 : horizontalDistance(start, after);
    checks.push(checked('the keyboard still moves the player', distance > 2, `${distance.toFixed(2)} m in 1 s`));
    await tools.call('game_input', { steps: [{ joypad_motion: 'left_y', value: -1, physics_frames: 60 }] });
    const afterStick = await gameVector(tools, 'Player', 'global_position');
    const stickDistance = after === undefined || afterStick === undefined ? 0 : horizontalDistance(after, afterStick);
    checks.push(checked('the left stick moves the player', stickDistance > 2, `${stickDistance.toFixed(2)} m in 60 physics frames`));
    const jump = await tools.call('game_input', {
      steps: [{ joypad_button: 'a', physics_frames: 1 }, { wait_physics_frames: 10 }, { read: 'Player', names: ['global_position'] }],
    });
    const height = vectorIn(jump.text, 'global_position')?.y ?? 0;
    checks.push(checked('the A button makes the player jump', height > 0.3, `${height.toFixed(2)} m up after 11 physics frames`));
    return checks;
  },
};
