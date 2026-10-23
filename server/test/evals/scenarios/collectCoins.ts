import { checked, conditionHolds, findNodes, gameVector, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, type Operation, writeScripts } from './fixtures.js';

const coinCount = 10;
const areas = 'get_tree().root.find_children("*", "Area3D", true, false)';
const firstLabel = 'get_tree().root.find_children("*", "Label", true, false)[0]';

const coinScript = [
  'extends Area3D',
  '',
  'signal collected',
  '',
  '',
  'func _ready() -> void:',
  '\tbody_entered.connect(_on_body_entered)',
  '',
  '',
  'func _process(delta: float) -> void:',
  '\trotate_y(delta * 2.0)',
  '',
  '',
  'func _on_body_entered(body: Node3D) -> void:',
  '\tif body.name == "Player":',
  '\t\tcollected.emit()',
  '\t\tqueue_free()',
  '',
].join('\n');

const counterScript = [
  'extends Label',
  '',
  'var _count := 0',
  '',
  '',
  'func _ready() -> void:',
  '\tfor coin in get_tree().get_nodes_in_group("coins"):',
  '\t\tcoin.collected.connect(_on_coin_collected)',
  '',
  '',
  'func _on_coin_collected() -> void:',
  '\t_count += 1',
  '\ttext = "Coins: %d" % _count',
  '',
].join('\n');

function coinOperations(): Operation[] {
  return Array.from({ length: coinCount }, (_unused, index) => {
    const angle = (index / coinCount) * Math.PI * 2;
    const name = `Coin${String(index + 1)}`;
    return [
      { op: 'node_add', type: 'Area3D', name, properties: { position: [Math.round(Math.cos(angle) * 600) / 100, 0.8, Math.round(Math.sin(angle) * 600) / 100], script: 'res://coin.gd' } },
      { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: name, properties: { shape: { new: 'SphereShape3D', radius: 0.5 } } },
      { op: 'node_add', type: 'MeshInstance3D', name: 'Mesh', parent: name, properties: { rotation_degrees: [90, 0, 0], mesh: { new: 'CylinderMesh', top_radius: 0.4, bottom_radius: 0.4, height: 0.1 } } },
      { op: 'node_set_groups', path: name, add: ['coins'] },
    ];
  }).flat();
}

export const collectCoins: Scenario = {
  name: 'collect-coins',
  request: 'Put 10 spinning coins around the arena that the player picks up by walking into them, and show on screen how many were collected.',
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools);
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'coin.gd': coinScript, 'coin_counter.gd': counterScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        ...coinOperations(),
        { op: 'node_add', type: 'CanvasLayer', name: 'HUD' },
        { op: 'node_add', type: 'Label', name: 'CoinCount', parent: 'HUD', properties: { position: [20, 20], text: 'Coins: 0', script: 'res://coin_counter.gd' } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools)];
    const coins = await findNodes(tools, arenaScene, { type: 'Area3D' });
    const coin = coins[0];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(tools, `the arena has ${String(coinCount)} coins`, '.', `${areas}.size() == ${String(coinCount)}`, 3_000),
      await conditionHolds(tools, 'a counter is on screen', '.', `${firstLabel}.is_visible_in_tree()`, 2_000),
    );
    if (coin === undefined) {
      return [...checks, checked('a coin can be found in the scene', false, 'no Area3D in the arena')];
    }
    const before = await tools.call('game_get_properties', { path: coin, names: ['rotation'] });
    await tools.call('game_wait', { physics_frames: 20 });
    const after = await tools.call('game_get_properties', { path: coin, names: ['rotation'] });
    checks.push(checked('the coins spin', before.text !== after.text, `${before.text.split('\n').at(-1) ?? ''} → ${after.text.split('\n').at(-1) ?? ''}`));
    const coinPosition = await gameVector(tools, coin, 'global_position');
    if (coinPosition !== undefined) {
      await tools.call('game_set_properties', { path: 'Player', properties: { global_position: [coinPosition.x, coinPosition.y - 0.9, coinPosition.z] } });
    }
    checks.push(
      await conditionHolds(tools, 'walking into a coin picks it up', '.', `${areas}.size() == ${String(coinCount - 1)}`, 3_000),
      await conditionHolds(tools, 'the counter shows 1', '.', `"1" in ${firstLabel}.text`, 2_000),
    );
    return checks;
  },
};
