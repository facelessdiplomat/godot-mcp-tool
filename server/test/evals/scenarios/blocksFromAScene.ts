import { mkdirSync } from 'node:fs';
import { type CheckResult, checked, conditionHolds, type Scenario } from '../Scenario.js';

const yardScene = 'res://yard.tscn';
const libraryPath = 'res://blocks/blocks.tres';
const readTimeoutMs = 3_000;
const landingTimeoutMs = 6_000;
const fieldSize = 10;
const corners = ['Vector3i(0, 0, 0)', 'Vector3i(9, 0, 0)', 'Vector3i(0, 0, 9)', 'Vector3i(9, 0, 9)'];

const blocks = [
  '[gd_scene load_steps=7 format=3]',
  '',
  '[sub_resource type="StandardMaterial3D" id="StandardMaterial3D_grass"]',
  'albedo_color = Color(0.25, 0.6, 0.2, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_grass"]',
  'material = SubResource("StandardMaterial3D_grass")',
  'size = Vector3(2, 0.5, 2)',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_grass"]',
  'size = Vector3(2, 0.5, 2)',
  '',
  '[sub_resource type="StandardMaterial3D" id="StandardMaterial3D_stone"]',
  'albedo_color = Color(0.5, 0.5, 0.52, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_stone"]',
  'material = SubResource("StandardMaterial3D_stone")',
  'size = Vector3(2, 2, 2)',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_stone"]',
  'size = Vector3(2, 2, 2)',
  '',
  '[node name="Blocks" type="Node3D"]',
  '',
  '[node name="Grass" type="MeshInstance3D" parent="."]',
  'mesh = SubResource("BoxMesh_grass")',
  '',
  '[node name="Body" type="StaticBody3D" parent="Grass"]',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Grass/Body"]',
  'shape = SubResource("BoxShape3D_grass")',
  '',
  '[node name="Stone" type="MeshInstance3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 3, 0, 0)',
  'mesh = SubResource("BoxMesh_stone")',
  '',
  '[node name="Body" type="StaticBody3D" parent="Stone"]',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Stone/Body"]',
  'shape = SubResource("BoxShape3D_stone")',
  '',
].join('\n');

const library = [
  '[gd_resource type="MeshLibrary" load_steps=7 format=3]',
  '',
  '[sub_resource type="StandardMaterial3D" id="StandardMaterial3D_grass"]',
  'albedo_color = Color(0.25, 0.6, 0.2, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_grass"]',
  'material = SubResource("StandardMaterial3D_grass")',
  'size = Vector3(2, 0.5, 2)',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_grass"]',
  'size = Vector3(2, 0.5, 2)',
  '',
  '[sub_resource type="StandardMaterial3D" id="StandardMaterial3D_stone"]',
  'albedo_color = Color(0.5, 0.5, 0.52, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_stone"]',
  'material = SubResource("StandardMaterial3D_stone")',
  'size = Vector3(2, 2, 2)',
  '',
  '[sub_resource type="BoxShape3D" id="BoxShape3D_stone"]',
  'size = Vector3(2, 2, 2)',
  '',
  '[resource]',
  'item/0/name = "Grass"',
  'item/0/mesh = SubResource("BoxMesh_grass")',
  'item/0/mesh_transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)',
  'item/0/shapes = [SubResource("BoxShape3D_grass"), Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)]',
  'item/1/name = "Stone"',
  'item/1/mesh = SubResource("BoxMesh_stone")',
  'item/1/mesh_transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)',
  'item/1/shapes = [SubResource("BoxShape3D_stone"), Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)]',
  '',
].join('\n');

const yard = [
  '[gd_scene load_steps=3 format=3]',
  '',
  '[sub_resource type="SphereShape3D" id="SphereShape3D_probe"]',
  'radius = 0.3',
  '',
  '[sub_resource type="SphereMesh" id="SphereMesh_probe"]',
  'radius = 0.3',
  'height = 0.6',
  '',
  '[node name="Yard" type="Node3D"]',
  '',
  '[node name="Ground" type="GridMap" parent="."]',
  '',
  '[node name="Probe" type="RigidBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 4, 5)',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Probe"]',
  'shape = SubResource("SphereShape3D_probe")',
  '',
  '[node name="Mesh" type="MeshInstance3D" parent="Probe"]',
  'mesh = SubResource("SphereMesh_probe")',
  '',
  '[node name="Camera" type="Camera3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 0.707107, 0.707107, 0, -0.707107, 0.707107, 10, 16, 26)',
  '',
  '[node name="Sun" type="DirectionalLight3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 0.642788, 0.766044, 0, -0.766044, 0.642788, 0, 8, 0)',
  '',
].join('\n');

const itemId = (name: string): string => `mesh_library.find_item_by_name("${name}")`;

export const blocksFromAScene: Scenario = {
  name: 'blocks-from-a-scene',
  request:
    'Turn the blocks of res://blocks/blocks.tscn into a MeshLibrary saved as res://blocks/blocks.tres, keeping their collision, give it to the GridMap of res://yard.tscn and pave the yard with it: Grass on every cell from (0, 0, 0) to (9, 0, 9), but a Stone on each of the four corners.',
  projectOptions: { mainScene: yardScene },
  async prepare({ project, tools }) {
    mkdirSync(project.path('blocks'), { recursive: true });
    project.write('blocks/blocks.tscn', blocks);
    project.write('yard.tscn', yard);
    await tools.call('editor_rescan');
  },
  async solve({ project, tools }) {
    project.write('blocks/blocks.tres', library);
    await tools.call('editor_rescan');
    await tools.call('node_set_properties', { scene: yardScene, path: 'Ground', properties: { mesh_library: libraryPath } });
    await tools.call('gridmap_set_cells', {
      scene: yardScene,
      path: 'Ground',
      boxes: [{ from: [0, 0, 0], to: [fieldSize - 1, 0, fieldSize - 1], item: 'Grass' }],
      cells: [
        { position: [0, 0, 0], item: 'Stone' },
        { position: [9, 0, 0], item: 'Stone' },
        { position: [0, 0, 9], item: 'Stone' },
        { position: [9, 0, 9], item: 'Stone' },
      ],
    });
    await tools.call('scene_save', { scene: yardScene });
  },
  async check({ tools }) {
    const ground = await tools.call('node_get_properties', { scene: yardScene, path: 'Ground', names: ['mesh_library'] });
    const checks: CheckResult[] = [checked('the GridMap of the yard uses res://blocks/blocks.tres', ground.text.includes(libraryPath), ground.text.split('\n').at(-1) ?? '')];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(tools, 'the library has a Grass and a Stone block with meshes', 'Ground', `mesh_library != null and ${itemId('Grass')} >= 0 and ${itemId('Stone')} >= 0 and mesh_library.get_item_mesh(${itemId('Grass')}) != null and mesh_library.get_item_mesh(${itemId('Stone')}) != null`, readTimeoutMs),
      await conditionHolds(tools, 'both blocks keep their collision', 'Ground', `mesh_library.get_item_shapes(${itemId('Grass')}).size() > 0 and mesh_library.get_item_shapes(${itemId('Stone')}).size() > 0`, readTimeoutMs),
      await conditionHolds(tools, 'the yard has 100 cells: 96 of Grass and 4 of Stone', 'Ground', `get_used_cells().size() == 100 and get_used_cells_by_item(${itemId('Grass')}).size() == 96 and get_used_cells_by_item(${itemId('Stone')}).size() == 4`, readTimeoutMs),
      await conditionHolds(tools, 'the Stone blocks stand on the four corners', 'Ground', corners.map((corner) => `get_cell_item(${corner}) == ${itemId('Stone')}`).join(' and '), readTimeoutMs),
      await conditionHolds(tools, 'a ball dropped on the yard comes to rest on the blocks', 'Probe', 'global_position.y > 1.0 and linear_velocity.length() < 0.05', landingTimeoutMs),
    );
    return checks;
  },
};
