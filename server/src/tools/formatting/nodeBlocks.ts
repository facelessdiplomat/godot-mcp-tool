import * as z from 'zod/v4';

export const failedNodeSchema = z.object({ path: z.string(), error: z.string(), hint: z.string().optional() });

export type FailedNode = z.infer<typeof failedNodeSchema>;

export function nodesOf<Node extends z.ZodObject>(node: Node): z.ZodObject<{ scene: z.ZodString; nodes: z.ZodArray<z.ZodUnion<[typeof failedNodeSchema, Node]>> }> {
  return z.object({ scene: z.string(), nodes: z.array(z.union([failedNodeSchema, node])) });
}

export function isFailedNode(node: object): node is FailedNode {
  return 'error' in node;
}

const answerBudgetCharacters = 24_000;

export interface NodeBlockFormat<Node> {
  readonly pathOf: (node: Node) => string;
  readonly describe: (node: Node) => string;
  readonly leftOutAdvice: string;
}

export function joinNodeBlocks<Node extends object>(nodes: readonly (Node | FailedNode)[], format: NodeBlockFormat<Node>): string {
  const { pathOf, describe, leftOutAdvice } = format;
  const blocks: string[] = [];
  const leftOut: string[] = [];
  let length = 0;
  for (const node of nodes) {
    const block = isFailedNode(node) ? describeFailure(node) : describe(node);
    if (leftOut.length > 0 || (blocks.length > 0 && length + block.length > answerBudgetCharacters)) {
      leftOut.push(isFailedNode(node) ? node.path : pathOf(node));
      continue;
    }
    blocks.push(block);
    length += block.length + 2;
  }
  const text = blocks.join('\n\n');
  return leftOut.length === 0
    ? text
    : `${text}\nNot shown, to keep the answer short: ${leftOut.join(', ')}. ${leftOutAdvice}`;
}

function describeFailure(node: FailedNode): string {
  return node.hint === undefined || node.hint === '' ? node.error : `${node.error}\nHint: ${node.hint}`;
}
