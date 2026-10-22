import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { formatNodePath } from './formatting/propertyReports.js';
import { duplicatedNodeSchema, movedNodeSchema, nodeDuplicateInput, nodeReparentInput, summarizeDuplication, summarizeMove } from './nodeStructureTools.js';
import { addedNodeSchema, deletedNodesSchema, nodeAddInput, nodeDeleteInput, nodeSetPropertiesInput, updatedNodeSchema } from './nodeTools.js';
import { propertyValues, sceneToChange } from './parameters.js';
import { textResult } from './results.js';
import { connectedSignalSchema, disconnectedSignalSchema, signalConnectInput, signalDisconnectInput, summarizeConnection, summarizeDisconnection } from './signalTools.js';

const maximumOperations = 100;

const briefPropertyValues = propertyValues.describe(
  'Property names mapped to values, in the formats of node_set_properties, such as {"position": [0, 1, 0], "mesh": {"new": "BoxMesh"}}.',
);

const operationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('node_add'), ...nodeAddInput.omit({ scene: true }).shape, properties: briefPropertyValues.optional() }),
  z.strictObject({ op: z.literal('node_delete'), ...nodeDeleteInput.omit({ scene: true }).shape }),
  z.strictObject({ op: z.literal('node_set_properties'), ...nodeSetPropertiesInput.omit({ scene: true }).shape, properties: briefPropertyValues }),
  z.strictObject({ op: z.literal('node_reparent'), ...nodeReparentInput.omit({ scene: true }).shape }),
  z.strictObject({ op: z.literal('node_duplicate'), ...nodeDuplicateInput.omit({ scene: true }).shape, properties: briefPropertyValues.optional() }),
  z.strictObject({ op: z.literal('signal_connect'), ...signalConnectInput.omit({ scene: true }).shape }),
  z.strictObject({ op: z.literal('signal_disconnect'), ...signalDisconnectInput.omit({ scene: true }).shape }),
]);

type Operation = z.output<typeof operationSchema>;

const operationResultSchema = z.discriminatedUnion('op', [
  addedNodeSchema.omit({ scene: true }).extend({ op: z.literal('node_add') }),
  deletedNodesSchema.omit({ scene: true }).extend({ op: z.literal('node_delete') }),
  updatedNodeSchema.omit({ scene: true }).extend({ op: z.literal('node_set_properties') }),
  movedNodeSchema.omit({ scene: true }).extend({ op: z.literal('node_reparent') }),
  duplicatedNodeSchema.omit({ scene: true }).extend({ op: z.literal('node_duplicate') }),
  connectedSignalSchema.omit({ scene: true }).extend({ op: z.literal('signal_connect') }),
  disconnectedSignalSchema.omit({ scene: true }).extend({ op: z.literal('signal_disconnect') }),
]);

type OperationResult = z.infer<typeof operationResultSchema>;

const batchResultSchema = z.object({ scene: z.string(), results: z.array(operationResultSchema) });

type BatchResult = z.infer<typeof batchResultSchema>;

const sceneBatchEditInput = z.object({
  operations: z
    .array(operationSchema)
    .min(1)
    .max(maximumOperations)
    .describe(
      'The changes in order. Each is {"op": a tool name, ...the parameters of that tool except scene}, such as {"op": "node_add", "type": "CharacterBody3D", "name": "Player"}, {"op": "node_set_properties", "path": "Player", "properties": {"position": [0, 1, 0]}} or {"op": "signal_connect", "from": "Start", "signal": "pressed", "method": "_on_start_pressed"}. op is node_add, node_delete, node_set_properties, node_reparent, node_duplicate, signal_connect or signal_disconnect.',
    ),
  scene: sceneToChange,
});

export function createSceneBatchEditTool(editor: EditorGateway): BridgeTool<typeof sceneBatchEditInput, BatchResult> {
  return new BridgeTool(editor, {
    name: 'scene_batch_edit',
    definition: {
      title: 'Edit scene in one step',
      description:
        'Apply many scene changes in one call and as one Undo step: add, delete, change, move and duplicate nodes, connect and disconnect signals. Later operations can use the nodes that earlier ones added or renamed. If any operation fails or any property is rejected, nothing is changed and the error names the operation. Use it to build or rework a scene.',
      inputSchema: sceneBatchEditInput,
      annotations: changingAnnotations({ destructive: true, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'scene.batch_edit',
    responseSchema: batchResultSchema,
    present: (batch, input) => textResult(describeBatch(batch, input.operations)),
  });
}

function describeBatch(batch: BatchResult, operations: readonly Operation[]): string {
  const count = batch.results.length;
  const lines = [`Applied ${String(count)} ${count === 1 ? 'operation' : 'operations'} to ${batch.scene} as one Undo step. The scene has unsaved changes.`];
  batch.results.forEach((result, index) => {
    lines.push(`${String(index + 1)}. ${summarizeOperation(result, operations[index])}`);
  });
  return lines.join('\n');
}

function summarizeOperation(result: OperationResult, operation: Operation | undefined): string {
  switch (result.op) {
    case 'node_add':
      return withSetProperties(`Added ${result.path} (${result.type})`, result.applied);
    case 'node_delete':
      return `Deleted ${result.deleted.join(', ')}`;
    case 'node_set_properties':
      return `Set ${result.applied.join(', ')} of ${formatNodePath(result.path)}`;
    case 'node_reparent':
      return summarizeMove(result, operation?.op === 'node_reparent' ? operation : {});
    case 'node_duplicate':
      return withSetProperties(summarizeDuplication(result), result.applied);
    case 'signal_connect':
      return summarizeConnection(result);
    case 'signal_disconnect':
      return summarizeDisconnection(result);
  }
}

function withSetProperties(summary: string, applied: readonly string[]): string {
  return applied.length === 0 ? summary : `${summary}; set ${applied.join(', ')}`;
}
