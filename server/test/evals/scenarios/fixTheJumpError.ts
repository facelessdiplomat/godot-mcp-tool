import { checked, conditionHolds, errorsOfTheRun, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, playerScript, writeScripts } from './fixtures.js';

const brokenPlayer = playerScript([], ['\t\t$JumpSound.play()']);
const fixedPlayer = playerScript([], ['\t\t$JumpSFX.play()']);

export const fixTheJumpError: Scenario = {
  name: 'fix-the-jump-error',
  request: 'When I press jump, the game prints an error and the jump sound never plays. Fix it.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, {
      player: brokenPlayer,
      operations: [{ op: 'node_add', type: 'AudioStreamPlayer3D', name: 'JumpSFX', parent: 'Player' }],
    });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'player.gd': fixedPlayer });
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    await conditionHolds(tools, 'the player stands on the floor', 'Player', 'is_on_floor()', 5_000);
    await tools.call('game_input', { steps: [{ key: 'Space' }, { wait_ms: 150 }] });
    const inTheAir = await tools.call('game_get_properties', { path: 'Player', names: ['is_on_floor()'] });
    await tools.call('game_wait', { physics_frames: 30 });
    const errors = await errorsOfTheRun(tools);
    checks.push(
      checked('the player still jumps', /is_on_floor\(\) = false/.test(inTheAir.text), inTheAir.text.split('\n').at(-1) ?? ''),
      checked('jumping prints no error', !/node not found|null instance|nonexistent|invalid call/i.test(errors), errors.split('\n').slice(0, 3).join(' | ')),
    );
    return checks;
  },
};
