import { agentUsed, checked, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, playerScript, writeScripts } from './fixtures.js';

const landingLines = ['', 'signal landed', '', 'var was_in_air := false'];

const reportLanding = (resetsTheFlag: boolean): string[] => [
  '\tif not is_on_floor():',
  '\t\twas_in_air = true',
  '\telif was_in_air:',
  ...(resetsTheFlag ? ['\t\twas_in_air = false'] : []),
  '\t\tlanded.emit()',
];

function landingPlayer(resetsTheFlag: boolean): string {
  return `${playerScript(landingLines)}${reportLanding(resetsTheFlag).join('\n')}\n`;
}

export const landOnce: Scenario = {
  name: 'land-once',
  request: "The player's landed signal fires again and again after a jump. Make it fire exactly once per landing, and show me the landing frame by frame.",
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, { player: landingPlayer(false) });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'player.gd': landingPlayer(true) });
    await tools.call('game_run');
    await tools.call('game_input', { steps: [{ wait_physics_frames: 20 }, { action: 'jump' }, { wait_physics_frames: 40 }, { screenshot: true }] });
    await tools.call('game_screenshot', { frames: 4, every_physics_frames: 4 });
  },
  async check({ tools, agent }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    const played = await tools.call('game_input', {
      steps: [{ wait_physics_frames: 20 }, { action: 'jump' }, { wait_physics_frames: 120 }],
      watch_signals: [{ node: 'Player', signal: 'landed' }],
    });
    checks.push(checked('a jump makes landed fire exactly once', played.text.includes('Player.landed was emitted 1 time'), played.text.split('\n').find((line) => line.startsWith('Player.landed')) ?? played.text));
    checks.push(...agentUsed(agent, ['game_screenshot', 'game_input'], 'the agent looked at the landing in the running game'));
    return checks;
  },
};
