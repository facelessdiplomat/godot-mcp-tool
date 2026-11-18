import { agentUsed, type CheckResult, checked, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const enemyScript = ['class_name Enemy', 'extends Node3D', '', 'var health := 10', '', '', 'func take_damage(amount: int = 1) -> void:', '\thealth -= amount', ''].join('\n');

const trapScript = ['extends Area3D', '', '@export var target: Enemy', '', '', 'func spring() -> void:', '\ttarget.take_damage(3)', ''].join('\n');

export const renameEverywhere: Scenario = {
  name: 'rename-everywhere',
  request: 'Rename take_damage to apply_damage everywhere, so that nothing calls the old name any more.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': enemyScript, 'trap.gd': trapScript });
    await buildArena(tools, [
      ...arenaOperations(),
      { op: 'node_add', type: 'Node3D', name: 'Goblin', properties: { script: 'res://enemy.gd', position: [0, 0, -3] } },
      { op: 'node_add', type: 'Area3D', name: 'Trap', properties: { script: 'res://trap.gd' } },
      { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
      { op: 'signal_connect', from: 'Trap', signal: 'body_entered', to: 'Goblin', method: 'take_damage' },
    ]);
    await tools.call('animation_set', {
      scene: arenaScene,
      player: 'AnimationPlayer',
      name: 'hurt',
      length: 1,
      tracks: [{ type: 'method', path: 'Goblin', keys: [{ time: 0.5, method: 'take_damage', args: [1] }] }],
    });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('script_rename_symbol', { path: 'res://enemy.gd', symbol: 'take_damage', new_name: 'apply_damage' });
  },
  async check({ project, tools, agent }) {
    const files = ['enemy.gd', 'trap.gd', 'arena.tscn'].map((file) => ({ file, text: project.read(file) }));
    const stillOld = files.filter((entry) => entry.text.includes('take_damage')).map((entry) => entry.file);
    const checks: CheckResult[] = [
      await scriptsAreClean(tools),
      checked('no file names take_damage any more', stillOld.length === 0, stillOld.length === 0 ? 'enemy.gd, trap.gd and arena.tscn are clean' : `still in ${stillOld.join(', ')}`),
      checked('the enemy declares apply_damage', project.read('enemy.gd').includes('func apply_damage('), 'enemy.gd'),
      checked('the signal connection and the method track call apply_damage', /method="apply_damage"/.test(project.read('arena.tscn')) && project.read('arena.tscn').includes('"method": &"apply_damage"'), 'arena.tscn'),
    ];
    await tools.call('game_run');
    const errors = await tools.call('game_get_output', { levels: ['error'] });
    checks.push(checked('the game runs without errors', !/^- /m.test(errors.text), errors.text.split('\n')[0] ?? ''));
    checks.push(...agentUsed(agent, ['script_rename_symbol'], 'the agent renamed with the language server instead of by hand'));
    return checks;
  },
};
