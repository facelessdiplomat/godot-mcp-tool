import { conditionHolds, type Scenario, checked } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, writeScripts } from './fixtures.js';

const enemyScenePath = 'res://enemy.tscn';

const enemyScene = [
  '[gd_scene load_steps=4 format=3]',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_gray"]',
  'albedo_color = Color(0.5, 0.5, 0.5, 1)',
  '',
  '[sub_resource type="CapsuleMesh" id="CapsuleMesh_body"]',
  'material = SubResource("Material_gray")',
  '',
  '[sub_resource type="CapsuleShape3D" id="CapsuleShape3D_body"]',
  '',
  '[node name="Enemy" type="CharacterBody3D"]',
  '',
  '[node name="Body" type="MeshInstance3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0)',
  'mesh = SubResource("CapsuleMesh_body")',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0)',
  'shape = SubResource("CapsuleShape3D_body")',
  '',
].join('\n');

const isRed = 'get_active_material(0).albedo_color.r > 0.7 and get_active_material(0).albedo_color.g < 0.3 and get_active_material(0).albedo_color.b < 0.3';
const isGray = 'absf(get_active_material(0).albedo_color.r - 0.5) < 0.05 and absf(get_active_material(0).albedo_color.g - 0.5) < 0.05';

export const paintOneEnemy: Scenario = {
  name: 'paint-one-enemy',
  request: 'Make the second enemy red and leave the other enemies as they are.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, {});
    project.write('enemy.tscn', enemyScene);
    await tools.call('editor_rescan');
    await buildArena(tools, [
      ...arenaOperations(),
      { op: 'node_add', type: enemyScenePath, name: 'Enemy1', properties: { position: [-4, 0, 0] } },
      { op: 'node_add', type: enemyScenePath, name: 'Enemy2', properties: { position: [0, 0, 0] } },
      { op: 'node_add', type: enemyScenePath, name: 'Enemy3', properties: { position: [4, 0, 0] } },
    ]);
  },
  async solve({ tools }) {
    await tools.call('node_set_properties', { scene: arenaScene, path: 'Enemy2/Body', properties: { material_override: { new: 'StandardMaterial3D', albedo_color: 'red' } } });
    await tools.call('scene_save');
  },
  async check({ project, tools }) {
    const enemyFile = project.read('enemy.tscn');
    await tools.call('game_run');
    return [
      await conditionHolds(tools, 'the second enemy is red', 'Enemy2/Body', isRed, 2_000),
      await conditionHolds(tools, 'the first enemy stays gray', 'Enemy1/Body', isGray, 2_000),
      await conditionHolds(tools, 'the third enemy stays gray', 'Enemy3/Body', isGray, 2_000),
      checked('the enemy scene itself is unchanged', enemyFile === enemyScene, enemyFile === enemyScene ? 'res://enemy.tscn as prepared' : 'res://enemy.tscn was changed'),
    ];
  },
};
