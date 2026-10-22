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
