import type { McpSession } from '../../integration/harness.js';
import { agentUsed, type CheckResult, checked, errorsOfTheRun, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const startingHealth = 100;
const expectedSources = ['poison', 'spikes', 'sword', 'turret'];
const expectedHealth = startingHealth - (1 + 2 + 4 + 3);
const startingDurability = 20;
const barrelHits = 2;
const expectedDurability = startingDurability - (1 + 5);

const enemyScript = ['class_name Enemy', 'extends Node3D', '', `var health := ${String(startingHealth)}`, 'var hits := 0', '', '', 'func take_damage(amount: int) -> void:', '\thealth -= amount', '\thits += 1', ''].join('\n');

const solvedEnemyScript = [
  'class_name Enemy',
  'extends Node3D',
  '',
  `var health := ${String(startingHealth)}`,
  'var hits := 0',
  'var sources: Array[String] = []',
  '',
  '',
  'func take_damage(amount: int, source: String) -> void:',
  '\thealth -= amount',
  '\thits += 1',
  '\tsources.append(source)',
  '',
].join('\n');

const barrelScript = [
  'class_name Barrel',
  'extends Node3D',
  '',
  `var durability := ${String(startingDurability)}`,
  'var hits := 0',
  '',
  '',
  'func take_damage(amount: int) -> void:',
  '\tdurability -= amount',
  '\thits += 1',
  '',
].join('\n');

function swordScript(enemyCall: string): string {
  return [
    'extends Node3D',
    '',
    '@onready var target: Enemy = $"../Goblin"',
    '@onready var barrel: Barrel = $"../Barrel"',
    '',
    '',
    'func _ready() -> void:',
    '\tawait get_tree().process_frame',
    `\t${enemyCall}`,
    '\tbarrel.take_damage(1)',
    '',
  ].join('\n');
}

function turretScript(call: string): string {
  return ['extends Node3D', '', '@onready var victim = $"../Goblin"', '', '', 'func _ready() -> void:', '\tawait get_tree().create_timer(0.1).timeout', `\t${call}`, ''].join('\n');
}

async function hurtAnimation(tools: McpSession, args: readonly unknown[]): Promise<void> {
  await tools.call('animation_set', {
    scene: arenaScene,
    player: 'AnimationPlayer',
    name: 'hurt',
    length: 1,
    tracks: [{ type: 'method', path: 'Goblin', keys: [{ time: 0.3, method: 'take_damage', args }] }],
  });
}

function numberIn(text: string, name: string): number {
  return Number(new RegExp(`^${name} = (?<value>-?\\d+)`, 'm').exec(text)?.groups?.['value']);
}

function sourcesIn(text: string): string[] {
  const listed = /^sources = (?:Array\[String\])?\(?\[(?<items>[^\]]*)\]/m.exec(text)?.groups?.['items'] ?? '';
  return [...listed.matchAll(/"(?<source>[^"]*)"/g)].map((match) => match.groups?.['source'] ?? '').sort();
}

export const oneMoreArgument: Scenario = {
  name: 'one-more-argument',
  request:
    'Give take_damage of res://enemy.gd a second argument, source: String, the name of what dealt the damage, and have the enemy append it to a new array sources: Array[String]. Then make every caller pass its own name as the source: "sword" for the sword, "turret" for the turret, "poison" for the poison timer and "spikes" for the hurt animation, so that every hit on the goblin and on the barrel still lands and the game runs without errors.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, {
      'enemy.gd': enemyScript,
      'barrel.gd': barrelScript,
      'sword.gd': swordScript('target.take_damage(1)'),
      'turret.gd': turretScript('victim.take_damage(2)'),
    });
    await buildArena(tools, [
      ...arenaOperations(),
      { op: 'node_add', type: 'Node3D', name: 'Goblin', properties: { script: 'res://enemy.gd', position: [0, 0, -3] } },
      { op: 'node_add', type: 'Node3D', name: 'Barrel', properties: { script: 'res://barrel.gd', position: [3, 0, -3] } },
      { op: 'node_add', type: 'Node3D', name: 'Sword', properties: { script: 'res://sword.gd' } },
      { op: 'node_add', type: 'Node3D', name: 'Turret', properties: { script: 'res://turret.gd', position: [4, 0, 0] } },
      { op: 'node_add', type: 'Timer', name: 'Poison', properties: { wait_time: 0.2, one_shot: true, autostart: true } },
      { op: 'node_add', type: 'Timer', name: 'Fuse', properties: { wait_time: 0.15, one_shot: true, autostart: true } },
      { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
      { op: 'signal_connect', from: 'Poison', signal: 'timeout', to: 'Goblin', method: 'take_damage', binds: [4] },
      { op: 'signal_connect', from: 'Fuse', signal: 'timeout', to: 'Barrel', method: 'take_damage', binds: [5] },
    ]);
    await hurtAnimation(tools, [3]);
    await tools.call('scene_batch_edit', { scene: arenaScene, operations: [{ op: 'node_set_properties', path: 'AnimationPlayer', properties: { autoplay: 'hurt' } }] });
    await tools.call('scene_save');
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, {
      'enemy.gd': solvedEnemyScript,
      'sword.gd': swordScript('target.take_damage(1, "sword")'),
      'turret.gd': turretScript('victim.take_damage(2, "turret")'),
    });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'signal_disconnect', from: 'Poison', signal: 'timeout', to: 'Goblin', method: 'take_damage' },
        { op: 'signal_connect', from: 'Poison', signal: 'timeout', to: 'Goblin', method: 'take_damage', binds: [4, 'poison'] },
      ],
    });
    await hurtAnimation(tools, [3, 'spikes']);
    await tools.call('scene_save');
  },
  async check({ project, tools, agent }) {
    const checks: CheckResult[] = [
      await scriptsAreClean(tools),
      checked('take_damage takes the source as its second argument', /func take_damage\(\s*amount\s*:\s*int\s*,\s*source\s*:\s*String\s*\)/.test(project.read('enemy.gd')), 'enemy.gd'),
      checked('the barrel keeps its own take_damage with one argument', /func take_damage\(\s*amount\s*:\s*int\s*\)/.test(project.read('barrel.gd')), 'barrel.gd'),
    ];
    await tools.call('game_run');
    const settled = await tools.call('game_wait', { node: 'Goblin', condition: `hits >= ${String(expectedSources.length)}`, timeout_ms: 5000 });
    const barrelSettled = await tools.call('game_wait', { node: 'Barrel', condition: `hits >= ${String(barrelHits)}`, timeout_ms: 3000 });
    const goblin = await tools.call('game_get_properties', { path: 'Goblin', names: ['health', 'sources'] });
    const barrel = await tools.call('game_get_properties', { path: 'Barrel', names: ['durability', 'hits'] });
    const sources = sourcesIn(goblin.text);
    const health = numberIn(goblin.text, 'health');
    const durability = numberIn(barrel.text, 'durability');
    const errors = await errorsOfTheRun(tools);
    checks.push(
      checked('every caller hit the enemy once', !settled.isError && settled.text.includes('became true'), settled.text.split('\n')[0] ?? ''),
      checked('every caller passed its own source', JSON.stringify(sources) === JSON.stringify(expectedSources), `sources: ${sources.join(', ') || 'none'}`),
      checked(`the enemy has ${String(expectedHealth)} health left`, health === expectedHealth, `health: ${String(health)}`),
      checked(
        `both hits on the barrel landed, leaving ${String(expectedDurability)} durability`,
        !barrelSettled.isError && barrelSettled.text.includes('became true') && durability === expectedDurability,
        `durability: ${String(durability)}, hits: ${String(numberIn(barrel.text, 'hits'))}`,
      ),
      checked('the game runs without errors', !/^- /m.test(errors), errors.split('\n')[0] ?? ''),
      ...agentUsed(agent, ['script_find_references'], 'the agent found the callers with the language server'),
    );
    return checks;
  },
};
