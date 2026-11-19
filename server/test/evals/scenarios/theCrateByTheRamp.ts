import { type CheckResult, conditionHolds, type Scenario } from '../Scenario.js';
import { arenaScene } from './fixtures.js';

interface Crate {
  readonly name: string;
  readonly position: readonly [number, number, number];
}

const crateAtTheFoot = 'Crate5';

const crates: readonly Crate[] = [
  { name: 'Crate1', position: [-6, 0.5, -6] },
  { name: 'Crate2', position: [5, 0.5, -8.6] },
  { name: 'Crate3', position: [-3, 0.5, 5] },
  { name: 'Crate4', position: [0, 0.5, 0] },
  { name: crateAtTheFoot, position: [5, 0.5, 0.4] },
  { name: 'Crate6', position: [7.5, 0.5, 6.5] },
  { name: 'Crate7', position: [-7, 0.5, 2] },
  { name: 'Crate8', position: [2, 0.5, 7] },
];

function crateNodes(): string[] {
  return crates.flatMap((crate) => [
    `[node name="${crate.name}" type="MeshInstance3D" parent="Crates"]`,
    `transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${crate.position.join(', ')})`,
    'mesh = SubResource("BoxMesh_crate")',
    '',
  ]);
}

const level = [
  '[gd_scene load_steps=5 format=3]',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_wood"]',
  'albedo_color = Color(0.55, 0.35, 0.2, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_crate"]',
  'material = SubResource("Material_wood")',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_stone"]',
  'albedo_color = Color(0.6, 0.6, 0.65, 1)',
  '',
  '[sub_resource type="Environment" id="Environment_day"]',
  'background_mode = 1',
  'background_color = Color(0.45, 0.6, 0.8, 1)',
  'ambient_light_source = 2',
  'ambient_light_color = Color(0.8, 0.8, 0.8, 1)',
  '',
  '[node name="Arena" type="Node3D"]',
  '',
  '[node name="Floor" type="CSGBox3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.5, 0)',
  'use_collision = true',
  'size = Vector3(20, 1, 20)',
  'material = SubResource("Material_stone")',
  '',
  '[node name="Ramp" type="CSGBox3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 0.965926, -0.258819, 0, 0.258819, 0.965926, 5, 0.6, -4)',
  'use_collision = true',
  'size = Vector3(3, 0.4, 6)',
  'material = SubResource("Material_stone")',
  '',
  '[node name="Crates" type="Node3D" parent="."]',
  '',
  ...crateNodes(),
  '[node name="Sun" type="DirectionalLight3D" parent="."]',
  'transform = Transform3D(0.866025, -0.353553, 0.353553, 0, 0.707107, 0.707107, -0.5, -0.612372, 0.612372, 0, 10, 0)',
  'shadow_enabled = true',
  '',
  '[node name="Environment" type="WorldEnvironment" parent="."]',
  'environment = SubResource("Environment_day")',
  '',
  '[node name="Camera" type="Camera3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 0.707107, 0.707107, 0, -0.707107, 0.707107, 0, 14, 14)',
  '',
].join('\n');

const isRed = 'get_active_material(0).albedo_color.r > 0.7 and get_active_material(0).albedo_color.g < 0.3 and get_active_material(0).albedo_color.b < 0.3';
const isWood = 'absf(get_active_material(0).albedo_color.r - 0.55) < 0.05 and absf(get_active_material(0).albedo_color.g - 0.35) < 0.05 and absf(get_active_material(0).albedo_color.b - 0.2) < 0.05';

export const theCrateByTheRamp: Scenario = {
  name: 'the-crate-by-the-ramp',
  request: 'One of the crates in res://arena.tscn stands at the foot of the ramp. Paint that crate red and leave the other crates as they are.',
  window: true,
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    project.write('arena.tscn', level);
    await tools.call('editor_rescan');
    await tools.call('scene_open', { path: arenaScene });
  },
  async solve({ tools }) {
    await tools.call('node_set_properties', {
      scene: arenaScene,
      path: `Crates/${crateAtTheFoot}`,
      properties: { material_override: { new: 'StandardMaterial3D', albedo_color: 'red' } },
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    await tools.call('game_run');
    const checks: CheckResult[] = [await conditionHolds(tools, 'the crate at the foot of the ramp is red', `Crates/${crateAtTheFoot}`, isRed, 2_000)];
    for (const crate of crates.filter((candidate) => candidate.name !== crateAtTheFoot)) {
      checks.push(await conditionHolds(tools, `${crate.name} keeps its wood color`, `Crates/${crate.name}`, isWood, 2_000));
    }
    return checks;
  },
};
