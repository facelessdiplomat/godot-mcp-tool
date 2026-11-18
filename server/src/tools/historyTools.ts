import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { sceneToChange } from './parameters.js';
import { textResult } from './results.js';

const historyStepSchema = z.object({
  scene: z.string(),
  undone: z.array(z.string()).optional(),
  redone: z.array(z.string()).optional(),
  stopped: z.enum(['', 'nothing_left', 'user_action']),
  next_undo: z.string(),
  next_redo: z.string(),
});

type HistoryStep = z.infer<typeof historyStepSchema>;

const historyStepInput = z.object({
  count: z.number().int().min(1).max(20).default(1).describe('How many actions to step through, newest first. Default: 1.'),
  include_user_actions: z
    .boolean()
    .default(false)
    .describe('Also step through actions that the user made in the editor. Default: false, so only the actions of these tools, named "MCP: …", are taken back or done again.'),
  scene: sceneToChange,
});

type Direction = 'undo' | 'redo';

export function createEditorUndoTool(editor: EditorGateway): BridgeTool<typeof historyStepInput, HistoryStep> {
  return createHistoryTool(editor, 'undo');
}

export function createEditorRedoTool(editor: EditorGateway): BridgeTool<typeof historyStepInput, HistoryStep> {
  return createHistoryTool(editor, 'redo');
}

function createHistoryTool(editor: EditorGateway, direction: Direction): BridgeTool<typeof historyStepInput, HistoryStep> {
  return new BridgeTool(editor, {
    name: `editor_${direction}`,
    definition: {
      title: direction === 'undo' ? 'Undo scene changes' : 'Redo scene changes',
      description:
        direction === 'undo'
          ? "Take back the last actions in a scene's Undo history, as Ctrl+Z in the editor does, and name them. Every change these tools make is one action named \"MCP: …\"; by default only those are taken back, and it stops at an action of the user. Redo them with editor_redo."
          : 'Do again the actions that editor_undo or the user took back in a scene, as Ctrl+Shift+Z in the editor does, and name them. By default only actions of these tools, named "MCP: …", are done again.',
      inputSchema: historyStepInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: `editor.${direction}`,
    responseSchema: historyStepSchema,
    present: (step) => textResult(describeStep(step, direction)),
  });
}

function describeStep(step: HistoryStep, direction: Direction): string {
  const stepped = (direction === 'undo' ? step.undone : step.redone) ?? [];
  const verb = direction === 'undo' ? 'Undid' : 'Redid';
  const lines =
    stepped.length === 0
      ? [step.stopped === 'user_action' ? `Nothing was ${direction === 'undo' ? 'undone' : 'redone'} in ${step.scene}.` : `Nothing to ${direction} in ${step.scene}.`]
      : [`${verb} ${String(stepped.length)} ${stepped.length === 1 ? 'action' : 'actions'} in ${step.scene}: ${stepped.join('; ')}. The scene has unsaved changes.`];
  const next = direction === 'undo' ? step.next_undo : step.next_redo;
  if (step.stopped === 'user_action') {
    lines.push(`It stopped at "${next}", an action of the user; pass include_user_actions: true to ${direction} it too.`);
  }
  lines.push(`Next to undo: ${step.next_undo === '' ? 'nothing' : step.next_undo}. Next to redo: ${step.next_redo === '' ? 'nothing' : step.next_redo}.`);
  return lines.join('\n');
}
