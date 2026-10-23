import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { counted } from './formatting/counting.js';
import {
  applyReportSchema,
  formatApplyReport,
  formatNodePath,
  formatPropertyList,
  isEmptyApplyReport,
  type PropertyList,
  propertyListSchema,
} from './formatting/propertyReports.js';
import { formatNodeSummary, nodeTraitsSchema } from './formatting/sceneTree.js';
import { nodePath, propertyValues, sceneToChange, sceneToRead } from './parameters.js';
import { errorResult, textResult } from './results.js';

export const addedNodeSchema = applyReportSchema.extend({ scene: z.string(), path: z.string(), type: z.string() });

type AddedNode = z.infer<typeof addedNodeSchema>;

export const deletedNodesSchema = z.object({ scene: z.string(), deleted: z.array(z.string()) });

type DeletedNodes = z.infer<typeof deletedNodesSchema>;

export const updatedNodeSchema = applyReportSchema.extend({ scene: z.string(), path: z.string() });

type UpdatedNode = z.infer<typeof updatedNodeSchema>;

const nodeBoundsSchema = z.object({
  scene: z.string(),
  path: z.string(),
  type: z.string(),
  position: z.string(),
  size: z.string(),
  center: z.string(),
  end: z.string(),
  visual_count: z.number(),
  collision_count: z.number(),
});

type NodeBounds = z.infer<typeof nodeBoundsSchema>;

const foundNodesSchema = z.object({
  scene: z.string(),
  matches: z.array(nodeTraitsSchema.extend({ path: z.string() })),
  total: z.number(),
  truncated: z.boolean(),
});

type FoundNodes = z.infer<typeof foundNodesSchema>;

export const nodeAddInput = z.object({
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
      alwaysLoad: false,
    },
    method: 'node.add',
    responseSchema: addedNodeSchema,
    present: (added) => {
      const summary = `Added ${added.path} (${added.type}) to ${added.scene}. The scene has unsaved changes.`;
      return textResult(isEmptyApplyReport(added) ? summary : `${summary}\n${formatApplyReport(added)}`);
    },
  });
}

export const nodeDeleteInput = z.object({
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

const nodeFindInput = z.object({
  name: z.string().min(1).optional().describe('Part of the node name, or a pattern with * and ?, such as "Enemy*". Case does not matter.'),
  type: z.string().min(1).optional().describe('A node class or class_name. Subclasses match too, so "Light3D" finds every light.'),
  group: z.string().min(1).optional().describe('A group the node belongs to, such as "enemies".'),
  script: z.string().min(1).optional().describe('The attached script, as a res:// path or a file name such as "player.gd".'),
  scene: sceneToRead,
  max_results: z.number().int().min(1).max(500).default(50).describe('The most nodes to list.'),
});

export function createNodeFindTool(editor: EditorGateway): BridgeTool<typeof nodeFindInput, FoundNodes> {
  return new BridgeTool(editor, {
    name: 'node_find',
    definition: {
      title: 'Find nodes',
      description:
        'Find nodes in a scene by name, type, group or attached script; every given criterion must match. Returns their paths for the other node tools. Nodes inside instanced scenes are not searched, only the instances themselves.',
      inputSchema: nodeFindInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'node.find',
    responseSchema: foundNodesSchema,
    present: (found, input) => textResult(describeFoundNodes(found, input)),
  });
}

function describeFoundNodes(found: FoundNodes, input: z.output<typeof nodeFindInput>): string {
  if (found.matches.length === 0) {
    return `No node in ${found.scene} matches ${describeCriteria(input)}.`;
  }
  const heading = found.total === 1 ? `1 node in ${found.scene} matches:` : `${String(found.total)} nodes in ${found.scene} match:`;
  const lines = [heading, ...found.matches.map((match) => formatNodeSummary(match.path, match))];
  if (found.truncated) {
    lines.push(`Showing the first ${String(found.matches.length)} of ${String(found.total)}; narrow the search or raise max_results.`);
  }
  return lines.join('\n');
}

function describeCriteria(input: z.output<typeof nodeFindInput>): string {
  const criteria = [
    input.name === undefined ? undefined : `name "${input.name}"`,
    input.type === undefined ? undefined : `type ${input.type}`,
    input.group === undefined ? undefined : `group "${input.group}"`,
    input.script === undefined ? undefined : `script ${input.script}`,
  ];
  return criteria.filter((criterion) => criterion !== undefined).join(' and ');
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
      alwaysLoad: true,
    },
    method: 'node.get_properties',
    responseSchema: propertyListSchema,
    present: (list) => textResult(formatPropertyList(list)),
  });
}

const nodeGetBoundsInput = z.object({
  path: z
    .string()
    .min(1)
    .describe('Path of the node relative to the scene root, such as "Level/Crate"; "." measures the whole scene. With in_game, a path in the running game, such as "Player".'),
  scene: sceneToRead,
  in_game: z.boolean().default(false).describe('Measure the node in the running game instead, where it may have moved. Needs a game started from the editor.'),
});

export function createNodeGetBoundsTool(editor: EditorGateway): BridgeTool<typeof nodeGetBoundsInput, NodeBounds> {
  return new BridgeTool(editor, {
    name: 'node_get_bounds',
    definition: {
      title: 'Node bounds',
      description:
        'Measure the box that a 3D node and its children take up in world coordinates: center, size and corners, from its meshes and CSG shapes, or from its collision shapes when it has none. Use it to check placement and scale, such as whether a crate rests on the floor or a door is wide enough for the player.',
      inputSchema: nodeGetBoundsInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'node.get_bounds',
    responseSchema: nodeBoundsSchema,
    present: (bounds, input) => textResult(describeBounds(bounds, input.in_game)),
  });
}

function describeBounds(bounds: NodeBounds, inGame: boolean): string {
  const place = inGame ? `the running game${bounds.scene === '' ? '' : ` (${bounds.scene})`}` : bounds.scene;
  return [
    `${capitalized(formatNodePath(bounds.path))} (${bounds.type}) in ${place}, in world coordinates:`,
    `center ${bounds.center}, size ${bounds.size}`,
    `from ${bounds.position} to ${bounds.end}`,
    describeMeasuredNodes(bounds),
  ].join('\n');
}

function describeMeasuredNodes(bounds: NodeBounds): string {
  if (bounds.visual_count > 0) {
    return `Measured from ${counted(bounds.visual_count, 'visual node')}.`;
  }
  if (bounds.collision_count > 0) {
    return `No visual nodes, so measured from ${counted(bounds.collision_count, 'collision shape')}.`;
  }
  return 'There are no visual nodes or collision shapes below it, so this is only its position.';
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const groupsChangedSchema = z.object({
  scene: z.string(),
  path: z.string(),
  groups: z.array(z.string()),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  unchanged: z.array(z.string()),
});

type GroupsChanged = z.infer<typeof groupsChangedSchema>;

export const nodeSetGroupsInput = z.object({
  path: nodePath,
  add: z.array(z.string().min(1)).default([]).describe('Groups to add the node to, such as ["enemies", "damageable"].'),
  remove: z.array(z.string().min(1)).default([]).describe('Groups to take the node out of.'),
  scene: sceneToChange,
});

export function createNodeSetGroupsTool(editor: EditorGateway): BridgeTool<typeof nodeSetGroupsInput, GroupsChanged> {
  return new BridgeTool(editor, {
    name: 'node_set_groups',
    definition: {
      title: 'Set node groups',
      description:
        'Add a node to groups or take it out of them, as one Undo step; the groups are saved with the scene. Scripts find the nodes of a group with get_tree().get_nodes_in_group("enemies"), and node_find finds them by group.',
      inputSchema: nodeSetGroupsInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'node.set_groups',
    responseSchema: groupsChangedSchema,
    present: (changed) => textResult(describeGroupChange(changed)),
  });
}

export function summarizeGroupChange(changed: Omit<GroupsChanged, 'scene'>): string {
  return `Set the groups of ${formatNodePath(changed.path)}, now: ${listOfGroups(changed.groups)}`;
}

function describeGroupChange(changed: GroupsChanged): string {
  const node = formatNodePath(changed.path);
  if (changed.added.length === 0 && changed.removed.length === 0) {
    return `${capitalized(node)} in ${changed.scene} already had the groups as asked, now: ${listOfGroups(changed.groups)}.`;
  }
  const lines = [`Updated the groups of ${node} in ${changed.scene}, now: ${listOfGroups(changed.groups)}. The scene has unsaved changes.`];
  if (changed.unchanged.length > 0) {
    lines.push(`Already as asked: ${changed.unchanged.join(', ')}`);
  }
  return lines.join('\n');
}

function listOfGroups(groups: readonly string[]): string {
  return groups.length === 0 ? 'none' : groups.join(', ');
}

export const nodeSetPropertiesInput = z.object({
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
      alwaysLoad: false,
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
