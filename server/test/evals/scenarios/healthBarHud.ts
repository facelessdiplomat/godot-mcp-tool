import { conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, playerScript, playerStart, writeScripts } from './fixtures.js';

const firstBar = 'get_tree().root.find_children("*", "Range", true, false)[0]';

const spikesScript = [
  'extends Area3D',
  '',
  '',
  'func _ready() -> void:',
  '\tvar timer := Timer.new()',
  '\ttimer.wait_time = 1.0',
  '\ttimer.autostart = true',
  '\ttimer.timeout.connect(_hurt_bodies)',
  '\tadd_child(timer)',
  '',
  '',
  'func _hurt_bodies() -> void:',
  '\tfor body in get_overlapping_bodies():',
  '\t\tif body.has_method("take_damage"):',
  '\t\t\tbody.take_damage(10)',
  '',
].join('\n');

const healthBarScript = [
  'extends ProgressBar',
  '',
  '@onready var _player: Node = get_node("../../Player")',
  '',
  '',
  'func _process(_delta: float) -> void:',
  '\tvalue = _player.get("health")',
  '',
].join('\n');

const playerWithHealth = playerScript(['', 'var health := 100']).replace(
  '\tmove_and_slide()\n',
  '\tmove_and_slide()\n\n\nfunc take_damage(amount: int) -> void:\n\thealth = maxi(health - amount, 0)\n',
);

export const healthBarHud: Scenario = {
  name: 'health-bar-hud',
  request: "Add a health bar to the screen that shows the player's health and goes down when the player takes damage.",
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, {
      player: playerWithHealth,
      scripts: { 'spikes.gd': spikesScript },
      operations: [
        { op: 'node_add', type: 'Area3D', name: 'Spikes', properties: { position: playerStart, script: 'res://spikes.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Spikes', properties: { position: [0, 0.3, 0], shape: { new: 'BoxShape3D', size: [3, 0.6, 3] } } },
      ],
    });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'health_bar.gd': healthBarScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add', type: 'CanvasLayer', name: 'HUD' },
        { op: 'node_add', type: 'ProgressBar', name: 'HealthBar', parent: 'HUD', properties: { position: [20, 20], size: [240, 30], max_value: 100, value: 100, script: 'res://health_bar.gd' } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(
        tools,
        'the bar shows the health after the spikes hurt the player',
        'Player',
        `health < 100 and absf(${firstBar}.value / ${firstBar}.max_value - health / 100.0) < 0.011`,
        6_000,
      ),
      await conditionHolds(tools, 'the bar is on screen', 'Player', `${firstBar}.is_visible_in_tree()`, 2_000),
    );
    return checks;
  },
};
