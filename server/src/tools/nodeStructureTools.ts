import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { applyReportSchema, formatApplyReport, isEmptyApplyReport } from './formatting/propertyReports.js';
import { nodePath, propertyValues, sceneToChange } from './parameters.js';
import { textResult } from './results.js';

export const movedNodeSchema = z.object({
  scene: z.string(),
  path: z.string(),
  previous_path: z.string(),
  type: z.string(),
  updated_references: z.array(z.object({ node: z.string(), property: z.string(), path: z.string() })),
});

type MovedNode = z.infer<typeof movedNodeSchema>;

export const duplicatedNodeSchema = applyReportSchema.extend({ scene: z.string(), path: z.string(), source: z.string(), type: z.string() });

type DuplicatedNode = z.infer<typeof duplicatedNodeSchema>;

export interface MoveRequest {
  readonly parent?: string | undefined;
  readonly name?: string | undefined;
  readonly index?: number | undefined;
}

export const nodeReparentInput = z.object({
  path: nodePath,
  parent: z.string().min(1).optional().describe('Path of the new parent, such as "Props"; "." is the scene root. Default: the current parent.'),
  name: z.string().min(1).optional().describe('A new name for the node.'),
  index: z.number().int().min(0).optional().describe('The new position among the children of the parent; 0 is the first.'),
  keep_global_transform: z.boolean().default(true).describe('Keep a 3D node where it is in the world when its parent changes. Default: true.'),
  scene: sceneToChange,
});

export function createNodeReparentTool(editor: EditorGateway): BridgeTool<typeof nodeReparentInput, MovedNode> {
  return new BridgeTool(editor, {
    name: 'node_reparent',
    definition: {
      title: 'Move or rename node',
      description:
        'Move a node to another parent, rename it, or change its place among its siblings, as one Undo step; its children move with it. 3D nodes keep their place in the world unless keep_global_transform is false. Node paths that pointed at the moved nodes, such as a RemoteTransform3D remote_path or an exported NodePath, are updated.',
      inputSchema: nodeReparentInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'node.reparent',
    responseSchema: movedNodeSchema,
    present: (moved, input) => textResult(describeMovedNode(moved, input)),
  });
}

export function summarizeMove(moved: { readonly path: string; readonly previous_path: string }, request: MoveRequest): string {
  if (moved.path === '.') {
    return `Renamed the scene root to ${request.name ?? 'the same name'}`;
  }
  if (request.parent !== undefined) {
    return `Moved ${moved.previous_path} to ${moved.path}`;
  }
  if (request.name !== undefined) {
    return `Renamed ${moved.previous_path} to ${moved.path}`;
  }
  return `Moved ${moved.path} to position ${String(request.index ?? 0)} among its siblings`;
}

function describeMovedNode(moved: MovedNode, request: MoveRequest): string {
  const lines = [`${summarizeMove(moved, request)} in ${moved.scene}. The scene has unsaved changes.`];
  if (moved.updated_references.length > 0) {
    lines.push(
      'Updated node paths that pointed at the moved nodes:',
      ...moved.updated_references.map((reference) => `- ${reference.node}.${reference.property} = "${reference.path}"`),
    );
  }
  return lines.join('\n');
}

export const nodeDuplicateInput = z.object({
  path: nodePath,
  name: z.string().min(1).optional().describe('Name of the copy. Default: the name of the original with a number, such as "Crate2".'),
  parent: z.string().min(1).optional().describe('Put the copy under this node instead of right after the original.'),
  properties: propertyValues.optional(),
  scene: sceneToChange,
});

export function createNodeDuplicateTool(editor: EditorGateway): BridgeTool<typeof nodeDuplicateInput, DuplicatedNode> {
  return new BridgeTool(editor, {
    name: 'node_duplicate',
    definition: {
      title: 'Duplicate node',
      description:
        'Duplicate a node with its children, groups, scripts and signal connections, as one Undo step. The copy goes right after the original, or under parent; properties are set on the copy, such as {"position": [4, 0, 0]}.',
      inputSchema: nodeDuplicateInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'node.duplicate',
    responseSchema: duplicatedNodeSchema,
    present: (duplicated) => {
      const summary = `${summarizeDuplication(duplicated)} (${duplicated.type}) in ${duplicated.scene}. The scene has unsaved changes.`;
      return textResult(isEmptyApplyReport(duplicated) ? summary : `${summary}\n${formatApplyReport(duplicated)}`);
    },
  });
}

export function summarizeDuplication(duplicated: { readonly path: string; readonly source: string }): string {
  return `Duplicated ${duplicated.source} as ${duplicated.path}`;
}

export const savedBranchSchema = z.object({ scene: z.string(), path: z.string(), file: z.string(), type: z.string(), node_count: z.number().int() });

type SavedBranch = z.infer<typeof savedBranchSchema>;

export const nodeSaveAsSceneInput = z.object({
  path: nodePath,
  file: z
    .string()
    .min(1)
    .describe('The new scene file, such as "res://enemies/enemy.tscn". It must not exist yet; missing folders are created.'),
  scene: sceneToChange,
});

export function createNodeSaveAsSceneTool(editor: EditorGateway): BridgeTool<typeof nodeSaveAsSceneInput, SavedBranch> {
  return new BridgeTool(editor, {
    name: 'node_save_as_scene',
    definition: {
      title: 'Save branch as scene',
      description:
        'Save a node and its children as a scene file of their own and put an instance of that scene in their place, as Save Branch as Scene in the editor does: one Undo step, and the instance stays where the node was. Use it to turn something built in a level, such as an enemy, into a scene that other levels can instance with node_add. The new file is written at once; the changed scene stays unsaved until scene_save.',
      inputSchema: nodeSaveAsSceneInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'node.save_as_scene',
    responseSchema: savedBranchSchema,
    present: (saved) =>
      textResult(
        [
          `Saved ${describeBranch(saved)} as ${saved.file}, and put an instance of it in their place in ${saved.scene}.`,
          `The new file is saved; ${saved.scene} has unsaved changes, and Ctrl+Z in the editor puts the nodes back.`,
        ].join('\n'),
      ),
  });
}

export function summarizeSavedBranch(saved: { readonly path: string; readonly file: string }): string {
  return `Saved ${saved.path} as ${saved.file} and put an instance of it in its place`;
}

function describeBranch(saved: SavedBranch): string {
  const children = saved.node_count - 1;
  if (children <= 0) {
    return saved.path;
  }
  return `${saved.path} and its ${String(children)} child ${children === 1 ? 'node' : 'nodes'}`;
}

export const localizedInstanceSchema = z.object({ scene: z.string(), path: z.string(), scene_file: z.string(), taken_over: z.number().int() });

type LocalizedInstance = z.infer<typeof localizedInstanceSchema>;

export const nodeMakeLocalInput = z.object({
  path: nodePath,
  scene: sceneToChange,
});

export function createNodeMakeLocalTool(editor: EditorGateway): BridgeTool<typeof nodeMakeLocalInput, LocalizedInstance> {
  return new BridgeTool(editor, {
    name: 'node_make_local',
    definition: {
      title: 'Make instance local',
      description:
        'Turn an instance of another scene into nodes of this scene, as Make Local in the editor does, as one Undo step: its nodes stop following changes to the instanced scene file and can then be moved, deleted and changed here like any other node. To change one instance but keep it linked to its scene, set properties of its nodes with node_set_properties instead.',
      inputSchema: nodeMakeLocalInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'node.make_local',
    responseSchema: localizedInstanceSchema,
    present: (localized) =>
      textResult(
        `Made ${localized.path} local in ${localized.scene}: it and its ${String(localized.taken_over)} ${localized.taken_over === 1 ? 'node' : 'nodes'} from ${localized.scene_file} now belong to this scene and no longer follow changes to that file. The scene has unsaved changes.`,
      ),
  });
}

export function summarizeLocalization(localized: { readonly path: string; readonly scene_file: string; readonly taken_over: number }): string {
  return `Made ${localized.path} local, taking over ${String(localized.taken_over)} ${localized.taken_over === 1 ? 'node' : 'nodes'} from ${localized.scene_file}`;
}
