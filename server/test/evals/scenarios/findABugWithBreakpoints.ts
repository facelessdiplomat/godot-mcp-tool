import { agentUsed, checked, conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { writeScripts } from './fixtures.js';

const level = 'res://level.tscn';

const enemyScript = (resetValue: string): string =>
  [
    'extends Node3D',
    '',
    'var health := 3',
    'var invulnerable := false',
    '',
    '',
    'func take_damage(amount: int) -> void:',
    '\tif invulnerable:',
    '\t\treturn',
    '\thealth -= amount',
    '\tinvulnerable = true',
    '\tget_tree().create_timer(0.5).timeout.connect(_on_invulnerability_timeout)',
    '',
    '',
    'func _on_invulnerability_timeout() -> void:',
    `\tinvulnerable = ${resetValue}`,
    '',
  ].join('\n');

const hitterScript = [
  'extends Node',
  '',
  '',
  'func _ready() -> void:',
  '\tvar timer := Timer.new()',
  '\ttimer.wait_time = 1.0',
  '\ttimer.autostart = true',
  '\ttimer.timeout.connect(_hit)',
  '\tadd_child(timer)',
  '',
  '',
  'func _hit() -> void:',
  '\tget_node("../Enemy").take_damage(1)',
  '',
].join('\n');

export const findABugWithBreakpoints: Scenario = {
  name: 'find-a-bug-with-breakpoints',
  request: 'After the first hit, the enemy never takes damage again. Find out why with the debugger and fix it.',
  projectOptions: { mainScene: level },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': enemyScript('true'), 'hitter.gd': hitterScript });
    await tools.call('scene_create', { path: level, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'Node3D', name: 'Enemy', properties: { script: 'res://enemy.gd' } },
        { op: 'node_add', type: 'Node', name: 'Hitter', properties: { script: 'res://hitter.gd' } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': enemyScript('false') });
  },
  async check({ tools, agent }) {
    const breakpoints = await tools.call('debug_breakpoints', {});
    const checks = [
      await scriptsAreClean(tools),
      checked('no breakpoints are left', breakpoints.text.startsWith('The project has no breakpoints'), breakpoints.text.split('\n')[0] ?? ''),
    ];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(tools, 'the enemy takes damage again after the first hit', 'Enemy', 'health <= 1', 5_000),
      ...agentUsed(agent, ['debug_breakpoints'], 'the agent set a breakpoint'),
      ...agentUsed(agent, ['debug_state'], 'the agent read the state where the game stopped'),
    );
    return checks;
  },
};
