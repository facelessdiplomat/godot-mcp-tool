import type { McpSession } from '../../integration/harness.js';
import { decodePng, type Rgb } from '../../integration/pngImage.js';
import { type CheckResult, checked, findNodes, gameVector, type Scenario } from '../Scenario.js';
import { averageColorOf } from './imageAverage.js';

const levelScene = 'res://level.tscn';
const roomBCenter = { x: 12, y: 1.5, z: 0 };
const roomHalfWidth = 4;
const litBrightness = 40;
const crateShare = 0.2;
const wholeView = 1;

const level = [
  '[gd_scene load_steps=8 format=3]',
  '',
  '[sub_resource type="Environment" id="Environment_night"]',
  'background_mode = 1',
  'background_color = Color(0.02, 0.02, 0.04, 1)',
  'ambient_light_source = 2',
  'ambient_light_color = Color(0, 0, 0, 1)',
  'ambient_light_energy = 0.0',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_wall"]',
  'albedo_color = Color(0.8, 0.8, 0.75, 1)',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_blue"]',
  'albedo_color = Color(0.1, 0.3, 0.9, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_crate_a"]',
  'material = SubResource("Material_blue")',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_crate_b"]',
  'albedo_color = Color(0, 0, 0, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_crate_b"]',
  'material = SubResource("Material_crate_b")',
  '',
  '[node name="Level" type="Node3D"]',
  '',
  '[node name="Environment" type="WorldEnvironment" parent="."]',
  'environment = SubResource("Environment_night")',
  '',
  '[node name="RoomA" type="CSGBox3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.5, 0)',
  'flip_faces = true',
  'size = Vector3(8, 3, 8)',
  'material = SubResource("Material_wall")',
  '',
  '[node name="Lamp" type="OmniLight3D" parent="RoomA"]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0)',
  'omni_range = 8.0',
  '',
  '[node name="Crate" type="MeshInstance3D" parent="RoomA"]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0)',
  'mesh = SubResource("BoxMesh_crate_a")',
  '',
  '[node name="RoomB" type="CSGBox3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 12, 1.5, 0)',
  'flip_faces = true',
  'size = Vector3(8, 3, 8)',
  'material = SubResource("Material_wall")',
  '',
  '[node name="Crate" type="MeshInstance3D" parent="RoomB"]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0)',
  'mesh = SubResource("BoxMesh_crate_b")',
  '',
  '[node name="Camera" type="Camera3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.5, 3)',
  '',
].join('\n');

function isOrange([red, green, blue]: Rgb): boolean {
  return red > 150 && green > 50 && green < 200 && blue < 90 && red > green;
}

async function lightsInRoomB(tools: McpSession): Promise<CheckResult> {
  const lights = [...(await findNodes(tools, levelScene, { type: 'OmniLight3D' })), ...(await findNodes(tools, levelScene, { type: 'SpotLight3D' }))];
  const inside: string[] = [];
  for (const light of lights) {
    const position = await gameVector(tools, light, 'global_position');
    if (position !== undefined && Math.abs(position.x - roomBCenter.x) < roomHalfWidth && Math.abs(position.z - roomBCenter.z) < roomHalfWidth && position.y > 0 && position.y < 3) {
      inside.push(light);
    }
  }
  return checked('a light shines inside the second room', inside.length > 0, inside.length > 0 ? inside.join(', ') : `lights: ${lights.join(', ') || 'none'}`);
}

async function viewOfTheCrate(tools: McpSession, render: string | undefined, share: number): Promise<Rgb | undefined> {
  const shot = await tools.callForImage('game_screenshot', { views: [{ position: [12, 1.6, 2.5], look_at: [12, 0.6, 0], ...(render === undefined ? {} : { render }) }] });
  return shot.image === undefined ? undefined : averageColorOf(decodePng(shot.image), share);
}

export const whyIsItDark: Scenario = {
  name: 'why-is-it-dark',
  request:
    'The second room of res://level.tscn is pitch black in the game, and the crate in it should be orange. Find out why the room is dark and fix it, so that the room is lit and the crate shows its orange color.',
  window: true,
  projectOptions: { mainScene: levelScene },
  async prepare({ project, tools }) {
    project.write('level.tscn', level);
    await tools.call('editor_rescan');
  },
  async solve({ tools }) {
    await tools.call('scene_batch_edit', {
      scene: levelScene,
      operations: [
        { op: 'node_add', type: 'OmniLight3D', name: 'Lamp', parent: 'RoomB', properties: { position: [0, 1, 0], omni_range: 8 } },
        { op: 'node_set_properties', path: 'RoomB/Crate', properties: { 'mesh:material:albedo_color': '#ff8c1a' } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    await tools.call('game_run');
    const checks: CheckResult[] = [await lightsInRoomB(tools)];
    const unshaded = await viewOfTheCrate(tools, 'unshaded', crateShare);
    const lit = await viewOfTheCrate(tools, undefined, wholeView);
    checks.push(
      checked('the crate in the second room is orange', unshaded !== undefined && isOrange(unshaded), `average color of the crate ${JSON.stringify(unshaded)}, unshaded`),
      checked('the second room is lit', lit !== undefined && Math.max(...lit) > litBrightness, `average color of the view ${JSON.stringify(lit)}, lit`),
    );
    return checks;
  },
};
