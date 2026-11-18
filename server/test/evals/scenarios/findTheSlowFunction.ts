import { agentUsed, checked, type Scenario } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const worldScript = [
  'extends Node3D',
  '',
  'var routes := 0.0',
  '',
  '',
  'func _process(_delta: float) -> void:',
  '\troutes += plan_routes(5000)',
  '\troutes += count_coins()',
  '',
  '',
  'func plan_routes(steps: int) -> float:',
  '\tvar length := 0.0',
  '\tfor step in steps:',
  '\t\tlength += sqrt(float(step))',
  '\treturn length',
  '',
  '',
  'func count_coins() -> float:',
  '\treturn 1.0',
  '',
].join('\n');

export const findTheSlowFunction: Scenario = {
  name: 'find-the-slow-function',
  request: 'The game stutters. Tell me which function makes it slow, from a measurement of the running game, and make that function cheaper.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'world.gd': worldScript });
    await buildArena(tools, [...arenaOperations(), { op: 'node_set_properties', path: '.', properties: { script: 'res://world.gd' } }]);
  },
  async solve({ project, tools }) {
    await tools.call('game_run');
    await tools.call('game_performance', { frames: 30 });
    await tools.call('game_stop');
    await writeScripts(project, tools, { 'world.gd': worldScript.replace('plan_routes(5000)', 'plan_routes(50)') });
  },
  async check({ tools, agent }) {
    await tools.call('game_run');
    const measured = await tools.call('game_performance', { frames: 30 });
    const routes = /- plan_routes \(res:\/\/world\.gd:\d+\): (?<ms>[\d.]+) ms/.exec(measured.text)?.groups?.['ms'];
    const routeMs = routes === undefined ? 0 : Number(routes);
    return [
      checked('plan_routes takes less than 5 ms over 30 frames', routeMs < 5, routes === undefined ? 'plan_routes did not show up among the slow functions' : `plan_routes took ${String(routeMs)} ms`),
      ...agentUsed(agent, ['game_performance'], 'the agent measured the running game instead of reading the code'),
    ];
  },
};
