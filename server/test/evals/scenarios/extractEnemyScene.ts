import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { TemporaryProject } from '../../integration/harness.js';
import { checked, errorsOfTheRun, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, type Operation, writeScripts } from './fixtures.js';

const enemyPositions: readonly (readonly number[])[] = [
  [-5, 0, -5],
  [0, 0, -6],
  [5, 0, -5],
];

const enemyScript = [
  'extends CharacterBody3D',
  '',
  '@export var speed := 2.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tmove_and_slide()',
  '',
].join('\n');

function enemyBodyOperations(parent: string): Operation[] {
  return [
    { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent, properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
    { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent, properties: { position: [0, 0.9, 0], mesh: { new: 'BoxMesh', size: [0.8, 1.8, 0.8] } } },
  ];
}

function sceneFiles(project: TemporaryProject, folder = project.root): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'addons') {
      return [];
    }
    const path = join(folder, entry.name);
    return entry.isDirectory() ? sceneFiles(project, path) : entry.name.endsWith('.tscn') ? [path] : [];
  });
}

export const extractEnemyScene: Scenario = {
  name: 'extract-an-enemy-scene',
  request: 'The arena has three enemies built by hand. Turn one of them into a reusable enemy scene and replace all three with instances of it, keeping their positions.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'enemy.gd': enemyScript });
    await buildArena(tools, [
      ...arenaOperations(),
      ...enemyPositions.flatMap((position, index) => {
        const name = `Enemy${String(index + 1)}`;
        return [{ op: 'node_add', type: 'CharacterBody3D', name, properties: { position, script: 'res://enemy.gd' } }, ...enemyBodyOperations(name)];
      }),
    ]);
  },
  async solve({ tools }) {
    await tools.call('scene_create', { path: 'res://enemies/enemy.tscn', root_type: 'CharacterBody3D' });
    await tools.call('scene_batch_edit', {
      scene: 'res://enemies/enemy.tscn',
      operations: [{ op: 'node_set_properties', path: '.', properties: { script: 'res://enemy.gd' } }, ...enemyBodyOperations('.')],
    });
    await tools.call('scene_save', { scene: 'res://enemies/enemy.tscn' });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_delete', paths: ['Enemy1', 'Enemy2', 'Enemy3'] },
        ...enemyPositions.map((position, index) => ({ op: 'node_add', type: 'res://enemies/enemy.tscn', name: `Enemy${String(index + 1)}`, properties: { position } })),
      ],
    });
    await tools.call('scene_save', { scene: arenaScene });
  },
  async check({ project, tools }) {
    const arenaText = project.read('arena.tscn');
    const enemyScenes = sceneFiles(project).filter((file) => {
      const text = readFileSync(file, 'utf8');
      const rootLine = text.split('\n').find((line) => line.startsWith('[node ')) ?? '';
      return !file.endsWith('arena.tscn') && rootLine.includes('type="CharacterBody3D"') && text.includes('enemy.gd');
    });
    const enemyScene = enemyScenes[0];
    const resourcePath = enemyScene === undefined ? undefined : `res://${relative(project.root, enemyScene).split('\\').join('/')}`;
    const instanceId = resourcePath === undefined ? undefined : new RegExp(`path="${resourcePath}" id="(?<id>[^"]+)"`).exec(arenaText)?.groups?.['id'];
    const instanceBlocks = instanceId === undefined ? [] : arenaText.split('\n[').filter((block) => block.includes(`instance=ExtResource("${instanceId}")`));
    const origins = instanceBlocks.map((block) => /transform = Transform3D\((?:[^,]+, ){9}(?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/.exec(block)?.groups).map((origin) => (origin === undefined ? [0, 0, 0] : [Number(origin['x']), Number(origin['y']), Number(origin['z'])]));
    const keptPositions = enemyPositions.every((position) => origins.some((origin) => origin.every((value, axis) => Math.abs(value - (position[axis] ?? 0)) < 0.01)));
    const checks = [
      checked('a scene of its own holds the enemy with its script', enemyScene !== undefined, resourcePath ?? 'no such scene'),
      checked('the arena has three instances of it', instanceBlocks.length === 3, `${String(instanceBlocks.length)} instances`),
      checked('the instances keep the positions of the enemies', keptPositions, JSON.stringify(origins)),
      checked('no enemy is built by hand in the arena anymore', !arenaText.includes('type="CharacterBody3D"'), arenaText.includes('type="CharacterBody3D"') ? 'a CharacterBody3D is still defined in arena.tscn' : 'none'),
      await scriptsAreClean(tools),
    ];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 30 });
    const errors = await errorsOfTheRun(tools);
    checks.push(checked('the game runs without errors', !/error/i.test(errors.split('\n').slice(1).join('\n')), errors.split('\n')[0] ?? ''));
    return checks;
  },
};
