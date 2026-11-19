import { mkdirSync } from 'node:fs';
import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, conditionHolds, findNodes, type Scenario } from '../Scenario.js';

const stageScene = 'res://stage.tscn';
const swordScene = 'res://props/sword.tscn';
const handBone = 1;
const inHandMeters = 0.4;
const followedMeters = 0.2;
const framesApart = 15;
const readTimeoutMs = 3_000;
const vectorPattern = /global_position = Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/g;

const stage = [
  '[gd_scene load_steps=4 format=3]',
  '',
  '[sub_resource type="Animation" id="Animation_wave"]',
  'resource_name = "wave"',
  'length = 1.0',
  'loop_mode = 1',
  'tracks/0/type = "rotation_3d"',
  'tracks/0/imported = false',
  'tracks/0/enabled = true',
  'tracks/0/path = NodePath("Character/Skeleton:Arm")',
  'tracks/0/interp = 1',
  'tracks/0/loop_wrap = true',
  'tracks/0/keys = PackedFloat32Array(0, 1, 0, 0, -0.382683, 0.92388, 0.5, 1, 0, 0, 0.382683, 0.92388, 1, 1, 0, 0, -0.382683, 0.92388)',
  '',
  '[sub_resource type="AnimationLibrary" id="AnimationLibrary_main"]',
  '_data = {',
  '&"wave": SubResource("Animation_wave")',
  '}',
  '',
  '[sub_resource type="CapsuleMesh" id="CapsuleMesh_body"]',
  'radius = 0.3',
  'height = 1.6',
  '',
  '[node name="Stage" type="Node3D"]',
  '',
  '[node name="Character" type="Node3D" parent="."]',
  '',
  '[node name="Body" type="MeshInstance3D" parent="Character"]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.8, 0)',
  'mesh = SubResource("CapsuleMesh_body")',
  '',
  '[node name="Skeleton" type="Skeleton3D" parent="Character"]',
  'bones/0/name = "Arm"',
  'bones/0/parent = -1',
  'bones/0/rest = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0.3, 1.4, 0)',
  'bones/0/enabled = true',
  'bones/0/position = Vector3(0.3, 1.4, 0)',
  'bones/0/rotation = Quaternion(0, 0, 0, 1)',
  'bones/0/scale = Vector3(1, 1, 1)',
  'bones/1/name = "Hand"',
  'bones/1/parent = 0',
  'bones/1/rest = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0.6, 0, 0)',
  'bones/1/enabled = true',
  'bones/1/position = Vector3(0.6, 0, 0)',
  'bones/1/rotation = Quaternion(0, 0, 0, 1)',
  'bones/1/scale = Vector3(1, 1, 1)',
  '',
  '[node name="Animator" type="AnimationPlayer" parent="."]',
  'libraries = {',
  '&"": SubResource("AnimationLibrary_main")',
  '}',
  'autoplay = &"wave"',
  '',
  '[node name="Camera" type="Camera3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1.2, 4)',
  '',
  '[node name="Sun" type="DirectionalLight3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 0.707107, 0.707107, 0, -0.707107, 0.707107, 0, 4, 0)',
  '',
].join('\n');

const sword = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_blade"]',
  'size = Vector3(0.05, 0.8, 0.02)',
  '',
  '[node name="Sword" type="Node3D"]',
  '',
  '[node name="Blade" type="MeshInstance3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.4, 0)',
  'mesh = SubResource("BoxMesh_blade")',
  '',
].join('\n');

const handInWorld = `get_tree().current_scene.get_node("Character/Skeleton").to_global(get_tree().current_scene.get_node("Character/Skeleton").get_bone_global_pose(${String(handBone)}).origin)`;

async function swordInstances(tools: McpSession): Promise<string[]> {
  const found = await tools.call('node_find', { scene: stageScene, name: '*', max_results: 200 });
  return found.text.split('\n').flatMap((line) => {
    const path = /^(?<path>[^:]+): .*\[instance res:\/\/props\/sword\.tscn/.exec(line.trim())?.groups?.['path'];
    return path === undefined ? [] : [path];
  });
}

async function attachmentOnTheHand(tools: McpSession): Promise<{ readonly check: CheckResult; readonly path: string | undefined }> {
  const attachments = await findNodes(tools, stageScene, { type: 'BoneAttachment3D' });
  for (const attachment of attachments) {
    const properties = await tools.call('node_get_properties', { scene: stageScene, path: attachment, names: ['bone_name'] });
    if (properties.text.includes('bone_name = "Hand"')) {
      return { check: checked('a BoneAttachment3D follows the hand bone', true, attachment), path: attachment };
    }
  }
  return { check: checked('a BoneAttachment3D follows the hand bone', false, attachments.length === 0 ? 'no BoneAttachment3D in the stage' : attachments.join(', ')), path: undefined };
}

function moved(text: string): number {
  const [first, second] = [...text.matchAll(vectorPattern)].map((match) => [Number(match.groups?.['x']), Number(match.groups?.['y']), Number(match.groups?.['z'])]);
  return first === undefined || second === undefined ? 0 : Math.hypot(...first.map((value, index) => value - (second[index] ?? value)));
}

export const swordInHand: Scenario = {
  name: 'sword-in-hand',
  request:
    "Put the sword res://props/sword.tscn into the character's hand in res://stage.tscn, so that it stays in the hand while the character waves its arm.",
  projectOptions: { mainScene: stageScene },
  async prepare({ project, tools }) {
    mkdirSync(project.path('props'), { recursive: true });
    project.write('stage.tscn', stage);
    project.write('props/sword.tscn', sword);
    await tools.call('editor_rescan');
  },
  async solve({ tools }) {
    await tools.call('scene_batch_edit', {
      scene: stageScene,
      operations: [
        { op: 'node_add', type: 'BoneAttachment3D', name: 'HandAttachment', parent: 'Character/Skeleton', properties: { bone_name: 'Hand' } },
        { op: 'node_add', type: swordScene, name: 'Sword', parent: 'Character/Skeleton/HandAttachment' },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const attachment = await attachmentOnTheHand(tools);
    const swords = await swordInstances(tools);
    const swordPath = swords.find((path) => attachment.path !== undefined && path.startsWith(`${attachment.path}/`)) ?? swords[0];
    const checks: CheckResult[] = [
      attachment.check,
      checked('the sword is held by that attachment', swordPath !== undefined && attachment.path !== undefined && swordPath.startsWith(`${attachment.path}/`), swords.join(', ') || 'no instance of the sword'),
    ];
    if (swordPath === undefined) {
      return checks;
    }
    await tools.call('game_run');
    const played = await tools.call('game_input', {
      steps: [{ read: swordPath, names: ['global_position'] }, { wait_physics_frames: framesApart }, { read: swordPath, names: ['global_position'] }],
    });
    checks.push(
      await conditionHolds(tools, 'the sword is in the hand while the arm waves', swordPath, `global_position.distance_to(${handInWorld}) < ${String(inHandMeters)}`, readTimeoutMs),
      checked('the sword moves with the waving arm', moved(played.text) > followedMeters, `${moved(played.text).toFixed(2)} m in ${String(framesApart)} physics frames`),
    );
    return checks;
  },
};
