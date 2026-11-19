import { rmSync } from 'node:fs';
import { decodePng } from '../../integration/pngImage.js';
import { checked, errorsOfTheRun, findNodes, type Scenario } from '../Scenario.js';
import { writeScripts } from './fixtures.js';
import { averageColorOf } from './imageAverage.js';

const caveScene = 'res://cave.tscn';
const bakedDataPath = 'res://cave.VoxelGI_data.res';
const backWallShare = 0.3;
const litBrightness = 12;
const bakeTimeoutMs = 60_000;

const rock = { new: 'StandardMaterial3D', albedo_color: '#c4bcb0' };

const bakeScript = [
  'extends VoxelGI',
  '',
  '',
  'func _ready() -> void:',
  '\tawait get_tree().process_frame',
  '\tawait get_tree().process_frame',
  '\tbake()',
  `\tResourceSaver.save(data, "${bakedDataPath}")`,
  '',
].join('\n');

function nodeBlockOf(sceneText: string, name: string): string {
  const lines = sceneText.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`[node name="${name}"`));
  if (start < 0) {
    return '';
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith('['));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

export const lightTheCave: Scenario = {
  name: 'light-the-cave',
  request:
    'The cave in res://cave.tscn is pitch black inside when the game runs, although a VoxelGI covers it to bounce the sunlight from the entrance into it. Make the VoxelGI light the cave, without adding any lights, so that the game starts with the back of the cave lit.',
  window: true,
  projectOptions: { mainScene: caveScene },
  async prepare({ tools }) {
    await tools.call('scene_create', { path: caveScene, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      scene: caveScene,
      operations: [
        {
          op: 'node_add',
          type: 'WorldEnvironment',
          name: 'Environment',
          properties: {
            environment: {
              new: 'Environment',
              background_mode: 'Sky',
              sky: { new: 'Sky', sky_material: { new: 'ProceduralSkyMaterial' } },
              ambient_light_source: 'Color',
              ambient_light_color: '#000000',
              ambient_light_energy: 0,
              reflected_light_source: 'Disabled',
            },
          },
        },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-35, 0, 0], shadow_enabled: true, light_energy: 1.5 } },
        { op: 'node_add', type: 'CSGCombiner3D', name: 'Rock', properties: { use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Shell', parent: 'Rock', properties: { position: [0, 3, 0], size: [10, 6, 14], material: rock } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Hollow', parent: 'Rock', properties: { position: [0, 3, 0], size: [8, 4, 12], operation: 'Subtraction', material: rock } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Entrance', parent: 'Rock', properties: { position: [0, 2.5, 6.5], size: [3, 3, 2], operation: 'Subtraction', material: rock } },
        { op: 'node_add', type: 'VoxelGI', name: 'VoxelGI', properties: { position: [0, 3, 0], size: [10, 6, 14] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 2.5, 4.5] } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('voxelgi_bake', { scene: caveScene });
    await tools.call('scene_save');
  },
  otherSolutions: {
    'from the running game with a one-off script': async ({ project, tools }) => {
      await writeScripts(project, tools, { 'bake_cave_gi.gd': bakeScript });
      await tools.call('scene_batch_edit', { scene: caveScene, operations: [{ op: 'node_set_properties', path: 'VoxelGI', properties: { script: 'res://bake_cave_gi.gd' } }] });
      await tools.call('scene_save');
      await tools.call('game_run');
      await tools.call('game_wait', { node: 'VoxelGI', condition: 'data != null', timeout_ms: bakeTimeoutMs });
      await tools.call('game_stop');
      await tools.call('editor_rescan');
      await tools.call('scene_batch_edit', { scene: caveScene, operations: [{ op: 'node_set_properties', path: 'VoxelGI', properties: { script: null, data: bakedDataPath } }] });
      await tools.call('scene_save');
      rmSync(project.path('bake_cave_gi.gd'), { force: true });
      rmSync(project.path('bake_cave_gi.gd.uid'), { force: true });
      await tools.call('editor_rescan');
    },
  },
  async check({ project, tools }) {
    const voxelGi = nodeBlockOf(project.read('cave.tscn'), 'VoxelGI');
    const lights = await findNodes(tools, caveScene, { type: 'Light3D' });
    await tools.call('game_run');
    await tools.call('game_wait', { frames: 30 });
    const shot = await tools.callForImage('game_screenshot', {});
    const backWall = shot.image === undefined ? undefined : averageColorOf(decodePng(shot.image), backWallShare);
    const brightness = backWall === undefined ? 0 : Math.max(...backWall);
    const errors = await errorsOfTheRun(tools);
    return [
      checked('the VoxelGI keeps baked data in the saved scene', /^data = /m.test(voxelGi), voxelGi.split('\n').find((line) => line.startsWith('data = ')) ?? 'no data in cave.tscn'),
      checked('no light was added', lights.length === 1 && lights[0] === 'Sun', `lights: ${lights.join(', ') || 'none'}`),
      checked('the back of the cave is lit when the game starts', brightness >= litBrightness, `average color of the back of the cave ${JSON.stringify(backWall)}`),
      checked('the game runs without errors', !/^- /m.test(errors), errors.split('\n')[0] ?? ''),
    ];
  },
};
