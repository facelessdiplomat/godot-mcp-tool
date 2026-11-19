import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, conditionHolds, findNodes, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, type Operation, writeScripts } from './fixtures.js';

const playerLayer = 2;
const enemiesLayer = 3;
const inFrontOfTheDoor: readonly number[] = [0, 0, -5];
const enemyStart: readonly number[] = [6, 0, 0];
const physicsFramesForTheEnemy = 30;

const layerNames = { 'layer_names/3d_physics/layer_1': 'world', 'layer_names/3d_physics/layer_2': 'player', 'layer_names/3d_physics/layer_3': 'enemies' };

const doorScript = [
  'extends Node3D',
  '',
  'var is_open := false',
  '',
  '',
  'func open() -> void:',
  '\tif is_open:',
  '\t\treturn',
  '\tis_open = true',
  '\tcreate_tween().tween_property($Panel, "position:y", 3.0, 0.5)',
  '',
].join('\n');

const triggerScript = [
  'extends Area3D',
  '',
  '',
  'func _ready() -> void:',
  '\tbody_entered.connect(_on_body_entered)',
  '',
  '',
  'func _on_body_entered(_body: Node3D) -> void:',
  '\tget_parent().call("open")',
  '',
].join('\n');

const doorAndEnemy: Operation[] = [
  { op: 'node_add', type: 'Node3D', name: 'Door', properties: { position: [0, 0, -6], script: 'res://door.gd' } },
  { op: 'node_add', type: 'StaticBody3D', name: 'Panel', parent: 'Door' },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Door/Panel', properties: { position: [0, 1.5, 0], shape: { new: 'BoxShape3D', size: [2, 3, 0.2] } } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Mesh', parent: 'Door/Panel', properties: { position: [0, 1.5, 0], mesh: { new: 'BoxMesh', size: [2, 3, 0.2] } } },
  { op: 'node_add', type: 'CharacterBody3D', name: 'Enemy', properties: { position: enemyStart, collision_layer: ['enemies'], collision_mask: ['world'] } },
  { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Enemy', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
  { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Enemy', properties: { position: [0, 0.9, 0], mesh: { new: 'CapsuleMesh', radius: 0.4, height: 1.8 } } },
  { op: 'node_set_properties', path: 'Player', properties: { collision_layer: ['player'], collision_mask: ['world'] } },
];

function maskHasLayer(propertiesText: string, layer: number): boolean | undefined {
  const value = /collision_mask = (?<mask>\d+)/.exec(propertiesText)?.groups?.['mask'];
  return value === undefined ? undefined : (Number(value) & (1 << (layer - 1))) !== 0;
}

async function areaThatSeesOnlyThePlayer(tools: McpSession): Promise<CheckResult> {
  const areas = await findNodes(tools, arenaScene, { type: 'Area3D' });
  const masks: string[] = [];
  for (const area of areas) {
    const properties = await tools.call('node_get_properties', { scene: arenaScene, path: area, names: ['collision_mask'] });
    masks.push(`${area}: ${properties.text.split('\n').at(-1) ?? ''}`);
    if (maskHasLayer(properties.text, playerLayer) === true && maskHasLayer(properties.text, enemiesLayer) === false) {
      return checked('an area detects the player layer and not the enemies layer', true, masks.join('; '));
    }
  }
  return checked('an area detects the player layer and not the enemies layer', false, areas.length === 0 ? 'no Area3D in the arena' : masks.join('; '));
}

async function enemyLeavesTheDoorClosed(tools: McpSession): Promise<CheckResult> {
  await tools.call('game_set_properties', { path: 'Enemy', properties: { global_position: inFrontOfTheDoor } });
  await tools.call('game_wait', { physics_frames: physicsFramesForTheEnemy });
  const door = await tools.call('game_get_properties', { path: 'Door', names: ['is_open'] });
  await tools.call('game_set_properties', { path: 'Enemy', properties: { global_position: enemyStart } });
  return checked('the enemy in front of the door leaves it closed', door.text.includes('is_open = false'), door.text.split('\n').at(-1) ?? '');
}

export const onlyThePlayerOpensTheDoor: Scenario = {
  name: 'only-the-player-opens-the-door',
  request:
    'The door at the north wall of the arena has an open() function. Make it open when the player walks up to it, but never for the enemy. Use the physics layers that the project already names.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await tools.call('project_settings_set', { values: layerNames });
    await buildPrototype(project, tools, { scripts: { 'door.gd': doorScript }, operations: doorAndEnemy });
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'door_trigger.gd': triggerScript });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add', type: 'Area3D', name: 'Trigger', parent: 'Door', properties: { position: [0, 1, 1.5], collision_layer: [], collision_mask: ['player'], script: 'res://door_trigger.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Door/Trigger', properties: { shape: { new: 'BoxShape3D', size: [3, 2, 3] } } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools), await areaThatSeesOnlyThePlayer(tools)];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 10 });
    checks.push(await enemyLeavesTheDoorClosed(tools));
    await tools.call('game_set_properties', { path: 'Player', properties: { global_position: inFrontOfTheDoor } });
    checks.push(await conditionHolds(tools, 'the player in front of the door opens it', 'Door', 'is_open', 3_000));
    return checks;
  },
};
