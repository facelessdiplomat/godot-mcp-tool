import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type McpSession, testProjectRoot } from '../../integration/harness.js';
import { checked, findNodes, type Scenario, type Vector } from '../Scenario.js';

const model = 'res://models/character.glb';
const characterFixture = join(testProjectRoot, 'tests', 'fixtures', 'models', 'character.glb');
const fitToleranceMeters = 0.1;
const treeIndentWidth = 3;

interface Box {
  readonly center: Vector;
  readonly size: Vector;
}

interface Capsule {
  readonly radius: number;
  readonly height: number;
  readonly center: Vector;
}

export const importACharacter: Scenario = {
  name: 'import-a-character',
  request: 'Import the character model `res://models/character.glb`: scale it to 1.8 m and give it a capsule collision.',
  async prepare({ project, tools }) {
    mkdirSync(project.path('models'));
    copyFileSync(characterFixture, project.path('models/character.glb'));
    await tools.call('editor_rescan');
  },
  async solve({ tools }) {
    await tools.call('asset_import_settings_set', {
      path: model,
      options: { 'nodes/root_scale': 0.01 },
      nodes: { Body: { 'generate/physics': true, 'physics/shape_type': 'Capsule', 'primitive/radius': 25, 'primitive/height': 180 } },
    });
  },
  otherSolutions: {
    'with a character scene': async ({ tools }) => {
      await tools.call('asset_import_settings_set', { path: model, options: { 'nodes/root_scale': 0.01 } });
      await tools.call('scene_create', { path: 'res://characters/character.tscn', root_type: 'CharacterBody3D' });
      await tools.call('scene_batch_edit', {
        operations: [
          { op: 'node_add', type: model, name: 'Model' },
          { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.25, height: 1.8 } } },
        ],
      });
      await tools.call('scene_save');
    },
  },
  async check({ tools }) {
    const settings = await tools.call('asset_import_settings_get', { path: model });
    const capsule = importedCapsuleIn(settings.text) ?? (await capsuleOfACharacterScene(tools));
    await tools.call('scene_create', { path: 'res://measure_character.tscn', root_type: 'Node3D' });
    await tools.call('node_add', { type: model, name: 'Character' });
    const bounds = await tools.call('node_get_bounds', { path: 'Character' });
    const height = Number(/size Vector3\([^,]+, (?<height>[^,]+),/.exec(bounds.text)?.groups?.['height'] ?? 'NaN');
    await tools.call('scene_close', { unsaved: 'discard' });
    return [
      checked('the imported scene is 0.5 × 1.8 × 0.5 m', settings.text.includes('Imported scene: size Vector3(0.5, 1.8, 0.5)'), settings.text.split('\n').find((line) => line.startsWith('Imported scene')) ?? ''),
      checked(
        'one capsule of about 0.25 × 1.8 m sits at the center of the mesh',
        capsule !== undefined,
        capsule ?? 'no fitting capsule in the import settings or in a scene that instances the model',
      ),
      checked('an instance of the model is 1.8 m tall', Math.abs(height - 1.8) < 0.05, bounds.text.split('\n')[0] ?? ''),
    ];
  },
};

function importedCapsuleIn(settings: string): string | undefined {
  const lines = settings.split('\n');
  const collisionLine = lines.find((line) => line.startsWith('Collision shapes:')) ?? '';
  const importedLine = lines.find((line) => line.startsWith('Imported scene:')) ?? '';
  const shape = /CapsuleShape3D \(radius (?<radius>[\d.]+), height (?<height>[\d.]+)\) at Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/.exec(collisionLine)?.groups;
  const size = vectorAfter(importedLine, 'size');
  const from = vectorAfter(importedLine, 'from');
  if (shape === undefined || size === undefined || from === undefined || (collisionLine.match(/: \w+Shape3D \(/g) ?? []).length !== 1) {
    return undefined;
  }
  const capsule = { radius: Number(shape['radius']), height: Number(shape['height']), center: { x: Number(shape['x']), y: Number(shape['y']), z: Number(shape['z']) } };
  const mesh = { size, center: { x: from.x + size.x / 2, y: from.y + size.y / 2, z: from.z + size.z / 2 } };
  return capsuleFits(capsule, mesh) ? `import settings: ${collisionLine}` : undefined;
}

async function capsuleOfACharacterScene(tools: McpSession): Promise<string | undefined> {
  const usages = await tools.call('resource_find_usages', { path: model });
  for (const scene of scenesIn(usages.text)) {
    const fitting = await fittingCapsulesIn(tools, scene);
    if (fitting.length === 1) {
      return `${scene}: ${fitting.join(', ')}`;
    }
  }
  return undefined;
}

async function fittingCapsulesIn(tools: McpSession, scene: string): Promise<string[]> {
  const tree = await tools.call('scene_get_tree', { scene });
  const [instance] = instancePathsIn(tree.text, model);
  if (instance === undefined) {
    return [];
  }
  const mesh = boxIn((await tools.call('node_get_bounds', { scene, path: instance })).text);
  const fitting: string[] = [];
  for (const path of await findNodes(tools, scene, { type: 'CollisionShape3D' })) {
    const properties = await tools.call('node_get_properties', { scene, path, names: ['shape'] });
    const shape = boxIn((await tools.call('node_get_bounds', { scene, path })).text);
    if (mesh !== undefined && shape !== undefined && properties.text.includes('<CapsuleShape3D>') && capsuleFits(capsuleFilling(shape), mesh)) {
      fitting.push(path);
    }
  }
  return fitting;
}

function scenesIn(usages: string): string[] {
  return [...usages.matchAll(/^- (?<scene>res:\/\/[^:\s]+\.tscn)/gm)].flatMap((match) => (match.groups?.['scene'] === undefined ? [] : [match.groups['scene']]));
}

function instancePathsIn(tree: string, instanced: string): string[] {
  const ancestors: string[] = [];
  return tree
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const nameStart = line.search(/[^│├└─ ]/);
      if (nameStart < 0) {
        return [];
      }
      const depth = Math.floor(nameStart / treeIndentWidth);
      ancestors.length = depth;
      ancestors.push(line.slice(nameStart).split(': ')[0] ?? '');
      if (!line.includes(`[instance ${instanced}]`)) {
        return [];
      }
      return [depth === 0 ? '.' : ancestors.slice(1).join('/')];
    });
}

function boxIn(bounds: string): Box | undefined {
  const center = vectorAfter(bounds, 'center');
  const size = vectorAfter(bounds, 'size');
  return center === undefined || size === undefined ? undefined : { center, size };
}

function vectorAfter(text: string, label: string): Vector | undefined {
  const match = new RegExp(`${label} Vector3\\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\\)`).exec(text)?.groups;
  return match === undefined ? undefined : { x: Number(match['x']), y: Number(match['y']), z: Number(match['z']) };
}

function capsuleFilling(box: Box): Capsule {
  return { radius: Math.min(box.size.x, box.size.z) / 2, height: box.size.y, center: box.center };
}

function capsuleFits(capsule: Capsule, mesh: Box): boolean {
  const offsets = [capsule.center.x - mesh.center.x, capsule.center.y - mesh.center.y, capsule.center.z - mesh.center.z];
  return (
    Math.abs(capsule.radius - Math.min(mesh.size.x, mesh.size.z) / 2) <= fitToleranceMeters &&
    Math.abs(capsule.height - mesh.size.y) <= fitToleranceMeters &&
    offsets.every((offset) => Math.abs(offset) <= fitToleranceMeters)
  );
}
