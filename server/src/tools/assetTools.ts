import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { errorResult, textResult } from './results.js';

const settingValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const importedSceneSchema = z.object({
  size: z.string(),
  position: z.string(),
  nodes: z.array(z.object({ path: z.string(), type: z.string(), size: z.string().optional() })),
  collision_shapes: z.array(
    z.object({
      path: z.string(),
      shape: z.string(),
      dimensions: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]) })),
      position: z.string(),
    }),
  ),
});

type ImportedScene = z.infer<typeof importedSceneSchema>;

const importSettingsSchema = z.object({
  path: z.string(),
  importer: z.string(),
  type: z.string(),
  options: z.array(z.object({ name: z.string(), value: settingValueSchema })),
  node_settings: z.record(z.string(), z.record(z.string(), settingValueSchema)),
  scene: importedSceneSchema.nullable(),
});

type ImportSettings = z.infer<typeof importSettingsSchema>;

const importSettingsChangeSchema = z.object({
  path: z.string(),
  applied: z.array(z.string()),
  rejected: z.array(z.object({ name: z.string(), reason: z.string() })),
  scene_before: importedSceneSchema.nullable(),
  scene: importedSceneSchema.nullable(),
});

type ImportSettingsChange = z.infer<typeof importSettingsChangeSchema>;

const reimportTimeoutMs = 300_000;

const assetPath = z.string().min(1).describe('The imported file, as a res:// path such as "res://models/character.glb".');

const assetImportSettingsGetInput = z.object({ path: assetPath });

export function createAssetImportSettingsGetTool(editor: EditorGateway): BridgeTool<typeof assetImportSettingsGetInput, ImportSettings> {
  return new BridgeTool(editor, {
    name: 'asset_import_settings_get',
    definition: {
      title: 'Read import settings',
      description:
        'Read how Godot imports an asset such as a glTF, FBX or .blend model, a texture or a sound: its importer options (nodes/root_scale, nodes/root_type, materials/extract, …), the settings stored for nodes of a model, and for a model the size, nodes and collision shapes of the imported scene. Check the size first: models often arrive in centimeters, such as a character 180 units tall, and need nodes/root_scale 0.01.',
      inputSchema: assetImportSettingsGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'asset.import_settings_get',
    responseSchema: importSettingsSchema,
    present: (settings) => textResult(describeImportSettings(settings)),
  });
}

function describeImportSettings(settings: ImportSettings): string {
  const lines = [`${settings.path}, imported by the ${settings.importer} importer as ${settings.type}`];
  if (settings.scene !== null) {
    lines.push(
      `Imported scene: size ${settings.scene.size}, from ${settings.scene.position}`,
      `Nodes: ${settings.scene.nodes.map((node) => `${node.path} (${node.size === undefined ? node.type : `${node.type}, size ${node.size}`})`).join('; ')}`,
      describeCollisionShapes(settings.scene),
      `Node settings: ${describeNodeSettings(settings.node_settings)}`,
    );
  }
  lines.push('Options:', ...settings.options.map((option) => `${option.name} = ${formatSettingValue(option.value)}`));
  return lines.join('\n');
}

function describeNodeSettings(nodeSettings: ImportSettings['node_settings']): string {
  const nodes = Object.entries(nodeSettings);
  if (nodes.length === 0) {
    return 'none';
  }
  return nodes
    .map(([nodePath, settings]) => `${nodePath}: ${Object.entries(settings).map(([name, value]) => `${name} = ${formatSettingValue(value)}`).join(', ')}`)
    .join('; ');
}

const nodeSettingsDescription =
  'Settings for nodes of a model, keyed by node path as asset_import_settings_get lists them, such as {"Body": {"generate/physics": true, "physics/shape_type": "Capsule", "primitive/radius": 25, "primitive/height": 180}}. Settings: generate/physics, physics/body_type (StaticBody3D, RigidBody3D, Area3D), physics/shape_type (Decompose Convex, Single Convex, Trimesh, Box, Sphere, Cylinder, Capsule, Automatic), physics/layer and physics/mask (layer numbers), primitive/size, primitive/radius, primitive/height, primitive/position, primitive/rotation, generate/navmesh, generate/occluder, mesh_instance/cast_shadow, mesh_instance/layers, import/skip_import, node/node_type.';

const assetImportSettingsSetInput = z.object({
  path: assetPath,
  options: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Importer options by name, as asset_import_settings_get lists them, such as {"nodes/root_scale": 0.01, "materials/extract": "Extract Once", "materials/extract_path": "res://materials/"}.',
    ),
  nodes: z.record(z.string(), z.record(z.string(), z.unknown())).optional().describe(nodeSettingsDescription),
});

export function createAssetImportSettingsSetTool(editor: EditorGateway): BridgeTool<typeof assetImportSettingsSetInput, ImportSettingsChange> {
  return new BridgeTool(editor, {
    name: 'asset_import_settings_set',
    definition: {
      title: 'Change import settings',
      description:
        'Change the import settings of an asset and reimport it, so every scene that uses it gets the result. options change importer options, such as {"nodes/root_scale": 0.01} to turn centimeters into meters or {"nodes/root_type": "StaticBody3D"}; nodes give nodes of a model their own settings, such as collision with {"Body": {"generate/physics": true, "physics/shape_type": "Trimesh"}}. Primitive shapes (Box, Sphere, Cylinder, Capsule) are not fitted to the mesh: give primitive/size, primitive/radius and primitive/height in the model\'s own units, before root_scale, and primitive/position to move the shape from the node\'s origin. The result shows the size of the imported scene before and after and its collision shapes, to compare.',
      inputSchema: assetImportSettingsSetInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'asset.import_settings_set',
    responseSchema: importSettingsChangeSchema,
    timeoutMs: reimportTimeoutMs,
    present: (change) => {
      const rejected = change.rejected.length === 0 ? [] : ['Rejected:', ...change.rejected.map((rejection) => `- ${rejection.name}: ${rejection.reason}`)];
      if (change.applied.length === 0) {
        return errorResult([`The import settings of ${change.path} were not changed.`, ...rejected].join('\n'));
      }
      const lines = [`Reimported ${change.path}.`, `Applied: ${change.applied.join(', ')}`];
      if (change.scene !== null) {
        const before = change.scene_before === null || change.scene_before.size === change.scene.size ? '' : ` (was ${change.scene_before.size})`;
        lines.push(`Imported scene: size ${change.scene.size}${before}, from ${change.scene.position}`, describeCollisionShapes(change.scene));
      }
      return textResult([...lines, ...rejected].join('\n'));
    },
  });
}

function describeCollisionShapes(scene: ImportedScene): string {
  if (scene.collision_shapes.length === 0) {
    return 'Collision shapes: none';
  }
  const shapes = scene.collision_shapes.map((collision) => {
    const dimensions = collision.dimensions.map((dimension) => `${dimension.name} ${String(dimension.value)}`);
    const shape = dimensions.length === 0 ? collision.shape : `${collision.shape} (${dimensions.join(', ')})`;
    return `${collision.path}: ${shape} at ${collision.position}`;
  });
  return `Collision shapes: ${shapes.join('; ')}`;
}

function formatSettingValue(value: z.infer<typeof settingValueSchema>): string {
  if (value === '') {
    return '""';
  }
  return value === null ? 'null' : String(value);
}
