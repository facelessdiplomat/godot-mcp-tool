import * as z from 'zod/v4';

export interface NodeTraits {
  readonly type: string;
  readonly script?: string | undefined;
  readonly instance?: string | undefined;
  readonly groups?: readonly string[] | undefined;
}

export interface SceneTreeNode extends NodeTraits {
  readonly name: string;
  readonly child_count?: number | undefined;
  readonly children?: readonly SceneTreeNode[] | undefined;
}

export const nodeTraitsSchema = z.object({
  type: z.string(),
  script: z.string().optional(),
  instance: z.string().optional(),
  groups: z.array(z.string()).optional(),
});

const sceneTreeNodeSchema: z.ZodType<SceneTreeNode> = z.lazy(() =>
  nodeTraitsSchema.extend({
    name: z.string(),
    child_count: z.number().int().optional(),
    children: z.array(sceneTreeNodeSchema).optional(),
  }),
);

export const sceneTreeResultSchema = z.object({
  scene: z.string(),
  unsaved: z.boolean().optional(),
  node_count: z.number().int(),
  truncated: z.boolean(),
  root: sceneTreeNodeSchema,
});

export type SceneTreeResult = z.infer<typeof sceneTreeResultSchema>;

const branch = '├─ ';
const lastBranch = '└─ ';
const continuedIndent = '│  ';
const finishedIndent = '   ';

export function formatSceneTree(result: SceneTreeResult): string {
  const lines = [result.unsaved === true ? `${result.scene} (unsaved changes)` : result.scene, describeNode(result.root)];
  appendChildren(lines, result.root, '');
  if (result.truncated) {
    lines.push('Some nodes are not shown. Call scene_get_tree again with a larger max_depth or max_nodes to see them.');
  }
  return lines.join('\n');
}

function appendChildren(lines: string[], node: SceneTreeNode, indent: string): void {
  const children = node.children;
  if (children === undefined) {
    return;
  }
  const hiddenCount = (node.child_count ?? children.length) - children.length;
  children.forEach((child, index) => {
    const isLast = index === children.length - 1 && hiddenCount <= 0;
    lines.push(`${indent}${isLast ? lastBranch : branch}${describeNode(child)}`);
    appendChildren(lines, child, `${indent}${isLast ? finishedIndent : continuedIndent}`);
  });
  if (hiddenCount > 0) {
    lines.push(`${indent}${lastBranch}… ${String(hiddenCount)} more ${pluralizeChildren(hiddenCount)} not shown`);
  }
}

export function formatNodeSummary(label: string, node: NodeTraits): string {
  const parts = [`${label}: ${node.type}`];
  if (node.script !== undefined) {
    parts.push(`[script ${node.script}]`);
  }
  if (node.instance !== undefined) {
    parts.push(`[instance ${node.instance}]`);
  }
  if (node.groups !== undefined && node.groups.length > 0) {
    parts.push(`groups=${node.groups.join(',')}`);
  }
  return parts.join(' ');
}

function describeNode(node: SceneTreeNode): string {
  const summary = formatNodeSummary(node.name, node);
  if (node.children === undefined && node.child_count !== undefined && node.child_count > 0) {
    return `${summary} (${String(node.child_count)} ${pluralizeChildren(node.child_count)} not shown)`;
  }
  return summary;
}

function pluralizeChildren(count: number): string {
  return count === 1 ? 'child' : 'children';
}
