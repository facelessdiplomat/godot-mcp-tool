import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import {
  applyReportSchema,
  formatApplyReport,
  formatNodePath,
  formatPropertyList,
  isEmptyApplyReport,
  type PropertyList,
  propertyListSchema,
} from './formatting/propertyReports.js';
import { nodePath, propertyValues, sceneToChange, sceneToRead } from './parameters.js';
import { errorResult, textResult } from './results.js';

const addedNodeSchema = applyReportSchema.extend({ scene: z.string(), path: z.string(), type: z.string() });

type AddedNode = z.infer<typeof addedNodeSchema>;

const deletedNodesSchema = z.object({ scene: z.string(), deleted: z.array(z.string()) });

type DeletedNodes = z.infer<typeof deletedNodesSchema>;

const updatedNodeSchema = applyReportSchema.extend({ scene: z.string(), path: z.string() });

type UpdatedNode = z.infer<typeof updatedNodeSchema>;

const nodeAddInput = z.object({
  type: z
    .string()
    .describe('What to add: an engine class such as "MeshInstance3D", a class_name from the project, or a scene to instance such as "res://props/crate.tscn".'),
  name: z.string().optional().describe('Name of the new node. Default: the type name; a taken name gets a number.'),
  parent: z.string().default('.').describe('Path of the parent node relative to the scene root. Default: "." (the root).'),
  index: z.number().int().min(0).optional().describe('Position among the children of the parent. Default: after the last child.'),
  properties: propertyValues.optional(),
  scene: sceneToChange,
});

export function createNodeAddTool(editor: EditorGateway): BridgeTool<typeof nodeAddInput, AddedNode> {
  return new BridgeTool(editor, {
    name: 'node_add',
    definition: {
      title: 'Add node',
      description:
        'Add a node to a scene: an engine class, a class_name from the project, or an instance of another scene, with its properties set at once. One Undo step in the editor; the scene stays unsaved until scene_save. The result reports which properties applied.',
      inputSchema: nodeAddInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: true,
    },
    method: 'node.add',
    responseSchema: addedNodeSchema,
    present: (added) => {
      const summary = `Added ${added.path} (${added.type}) to ${added.scene}. The scene has unsaved changes.`;
      return textResult(isEmptyApplyReport(added) ? summary : `${summary}\n${formatApplyReport(added)}`);
    },
  });
}

const nodeDeleteInput = z.object({
  paths: z
    .array(z.string().min(1))
    .min(1)
    .describe('Paths of the nodes to delete, relative to the scene root, such as ["Enemies/Goblin"]. Children go with their parent.'),
  scene: sceneToChange,
});

export function createNodeDeleteTool(editor: EditorGateway): BridgeTool<typeof nodeDeleteInput, DeletedNodes> {
  return new BridgeTool(editor, {
    name: 'node_delete',
    definition: {
      title: 'Delete nodes',
      description:
        'Delete nodes and their children from a scene as one Undo step. If any path is not found, nothing is deleted. The scene root and nodes inside instanced scenes cannot be deleted here.',
      inputSchema: nodeDeleteInput,
      annotations: changingAnnotations({ destructive: true, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'node.delete',
    responseSchema: deletedNodesSchema,
    present: ({ scene, deleted }) =>
      textResult(`Deleted ${deleted.join(', ')} from ${scene}. The scene has unsaved changes; Ctrl+Z in the editor brings them back.`),
  });
}

const nodeGetPropertiesInput = z.object({
  path: nodePath,
  names: z
    .array(z.string())
    .optional()
    .describe('Properties to read, such as ["position", "mesh"]. Default: every property whose value differs from its default.'),
  include_defaults: z.boolean().default(false).describe('Without names, also list properties at their default values. The list gets long.'),
  scene: sceneToRead,
});

export function createNodeGetPropertiesTool(editor: EditorGateway): BridgeTool<typeof nodeGetPropertiesInput, PropertyList> {
  return new BridgeTool(editor, {
    name: 'node_get_properties',
    definition: {
      title: 'Node properties',
      description:
        'Read the properties of a node: those that differ from their defaults, or the ones named. Each value comes with its type, in Godot syntax; enums list their options. Use it to check a node before or after changing it.',
      inputSchema: nodeGetPropertiesInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'node.get_properties',
    responseSchema: propertyListSchema,
    present: (list) => textResult(formatPropertyList(list)),
  });
}

const nodeSetPropertiesInput = z.object({
  path: nodePath,
  properties: propertyValues,
  scene: sceneToChange,
});

export function createNodeSetPropertiesTool(editor: EditorGateway): BridgeTool<typeof nodeSetPropertiesInput, UpdatedNode> {
  return new BridgeTool(editor, {
    name: 'node_set_properties',
    definition: {
      title: 'Set node properties',
      description:
        'Set several properties of a node as one Undo step, including script (a res://….gd path) and resources (a res:// path, or {"new": "Class", …} to create one). Every value is read back: the result lists what applied, what was rejected and why, and what the engine changed, for example by clamping.',
      inputSchema: nodeSetPropertiesInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: true,
    },
    method: 'node.set_properties',
    responseSchema: updatedNodeSchema,
    present: (updated) => {
      const node = formatNodePath(updated.path);
      const report = formatApplyReport(updated);
      if (updated.applied.length === 0) {
        return errorResult(`No property of ${node} in ${updated.scene} took the requested value.\n${report}`);
      }
      return textResult(`Updated ${node} in ${updated.scene}. The scene has unsaved changes.\n${report}`);
    },
  });
}
