import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { describeUses, type FileUsages, fileUsagesShape, formatCodeMentions, formatUsers } from './formatting/fileUsageReports.js';
import { formatNodePath, formatValue } from './formatting/propertyReports.js';
import { nodePath, sceneToChange } from './parameters.js';
import { errorResult, textResult } from './results.js';

const scriptRunSchema = z.object({ value: z.unknown(), errors: z.array(z.object({ line: z.number(), message: z.string() })) });

type ScriptRun = z.infer<typeof scriptRunSchema>;

const methodCallSchema = z.object({ scene: z.string(), path: z.string(), method: z.string(), value: z.unknown(), changed: z.array(z.string()) });

type MethodCall = z.infer<typeof methodCallSchema>;

const evaluationSchema = z.object({ node: z.string(), value: z.unknown(), type: z.string() });

type Evaluation = z.infer<typeof evaluationSchema>;

const unsafeAnnotations = changingAnnotations({ destructive: true, idempotent: false });

const editorRunScriptInput = z.object({
  code: z
    .string()
    .min(1)
    .describe(
      'GDScript statements: the body of func run(scene: Node) -> Variant, where scene is the scene open in the editor. EditorInterface and every engine class are available. Return a value to see it, such as return scene.get_child_count().',
    ),
});

export function createEditorRunScriptTool(editor: EditorGateway): BridgeTool<typeof editorRunScriptInput, ScriptRun> {
  return new BridgeTool(editor, {
    name: 'editor_run_script',
    definition: {
      title: 'Run code in the editor',
      description:
        'Run GDScript code inside the editor for what no other tool covers, such as one change across many nodes or a question about the editor itself. The code can do anything the editor can, files included; its changes are not recorded for Undo, and scenes stay unsaved until scene_save. Errors come back with the lines of the code. The user confirms every call, and the editor must allow unsafe tools.',
      inputSchema: editorRunScriptInput,
      annotations: unsafeAnnotations,
      alwaysLoad: false,
      showsErrors: true,
      requiresUserInteraction: true,
    },
    method: 'editor.run_script',
    responseSchema: scriptRunSchema,
    present: (run) => {
      if (run.errors.length === 0) {
        return textResult(`The code ran in the editor and returned ${formatValue(run.value)}. Its changes are not in the Undo history.`);
      }
      const errors = run.errors.map((error) => `- line ${String(error.line)}: ${error.message}`);
      return errorResult([`The code ran in the editor with errors and returned ${formatValue(run.value)}:`, ...errors].join('\n'));
    },
  });
}

const nodeCallMethodInput = z.object({
  path: nodePath,
  method: z.string().min(1).describe('The method to call, such as "look_at" or "rotate_y".'),
  args: z.array(z.unknown()).default([]).describe('The arguments in order, in the formats of node_set_properties, such as [[0, 0, 0]] for a Vector3.'),
  scene: sceneToChange,
});

export function createNodeCallMethodTool(editor: EditorGateway): BridgeTool<typeof nodeCallMethodInput, MethodCall> {
  return new BridgeTool(editor, {
    name: 'node_call_method',
    definition: {
      title: 'Call a node method',
      description:
        'Call a method of a node in the editor, such as look_at to aim a camera or rotate_y, when setting properties cannot express the change. The changed properties of the node are recorded as one Undo step; other effects of the method are not. The user confirms every call, and the editor must allow unsafe tools.',
      inputSchema: nodeCallMethodInput,
      annotations: unsafeAnnotations,
      alwaysLoad: false,
      requiresUserInteraction: true,
    },
    method: 'node.call_method',
    responseSchema: methodCallSchema,
    present: (call) => textResult(describeCall(call)),
  });
}

function describeCall(call: MethodCall): string {
  const node = formatNodePath(call.path);
  const head = `Called ${call.method} on ${node} in ${call.scene}`;
  const returned = call.value === null || call.value === undefined ? undefined : formatValue(call.value);
  if (call.changed.length === 0) {
    return returned === undefined ? `${head}. It changed no property of ${node}.` : `${head}: it returned ${returned} and changed no property of ${node}.`;
  }
  const change = `It changed ${call.changed.join(', ')}, recorded as one Undo step; the scene has unsaved changes.`;
  return returned === undefined ? `${head}. ${change}` : `${head}: it returned ${returned}. ${change}`;
}

const gameEvalInput = z.object({
  expression: z
    .string()
    .min(1)
    .describe(
      'A Godot expression evaluated on the node, such as "position.y", "velocity.length()" or "get_tree().get_nodes_in_group(\\"enemies\\").size()". It can call methods, so it can change the game.',
    ),
  node: z
    .string()
    .optional()
    .describe('The node to evaluate it on: a path relative to the current scene, such as "Player", or absolute, such as "/root/GameState". Default: the scene root.'),
});

export function createGameEvalTool(game: EditorGateway): BridgeTool<typeof gameEvalInput, Evaluation> {
  return new BridgeTool(game, {
    name: 'game_eval',
    definition: {
      title: 'Evaluate in the game',
      description:
        'Evaluate a Godot expression on a node of the running game and return its value, for questions that properties and getters do not answer, such as the distance between two nodes or the number of nodes in a group. It can call any method, so it can change the game. The user confirms every call, and the project must allow unsafe tools in the editor. Needs a game started with game_run, with or without the editor.',
      inputSchema: gameEvalInput,
      annotations: unsafeAnnotations,
      alwaysLoad: false,
      requiresUserInteraction: true,
    },
    method: 'game.eval',
    responseSchema: evaluationSchema,
    present: (evaluation, input) =>
      textResult(`${input.expression} on ${formatNodePath(evaluation.node)} in the running game = ${formatValue(evaluation.value, evaluation.type)}  [${evaluation.type}]`),
  });
}

const fileDeletionSchema = z.object({
  deleted: z.array(z.string()),
  blocked: z.boolean(),
  failed: z.array(z.object({ path: z.string(), reason: z.string() })),
  ...fileUsagesShape,
});

type FileDeletion = z.infer<typeof fileDeletionSchema>;

const fileDeletionTimeoutMs = 90_000;

const filesystemDeleteInput = z.object({
  paths: z
    .array(z.string().min(1))
    .min(1)
    .describe('The files or folders to delete, as res:// paths such as ["res://materials/old_ice.tres", "res://levels/unused"].'),
  force: z.boolean().default(false).describe('Delete even when the project uses the files, which leaves those references broken. Default: false.'),
});

export function createFilesystemDeleteTool(editor: EditorGateway): BridgeTool<typeof filesystemDeleteInput, FileDeletion> {
  return new BridgeTool(editor, {
    name: 'filesystem_delete',
    definition: {
      title: 'Delete files',
      description:
        'Delete files or folders of the project by moving them to the system trash with their .import and .uid files; the user can restore them from there. Deletes nothing while the project uses them — scenes and resources that refer to them, project settings that point at them, scripts and shaders that name their path or UID — and lists those uses instead; force: true deletes anyway, leaves those references broken and clears the project settings. Never deletes the script or scene of an autoload; remove the autoload with autoload_remove first. Deleted scenes that are open in the editor are closed, unless they have unsaved changes. The user confirms every call, and the editor must allow unsafe tools.',
      inputSchema: filesystemDeleteInput,
      annotations: unsafeAnnotations,
      alwaysLoad: false,
      requiresUserInteraction: true,
    },
    method: 'filesystem.delete',
    responseSchema: fileDeletionSchema,
    timeoutMs: fileDeletionTimeoutMs,
    present: (deletion, input) => describeDeletion(deletion, input.paths),
  });
}

function describeDeletion(deletion: FileDeletion, paths: readonly string[]): CallToolResult {
  if (deletion.blocked) {
    return errorResult(
      [`Nothing was deleted: the project still uses ${namedTargets(paths)}.`, ...describeUses(deletion), 'Change those first, or pass force: true to delete anyway.'].join('\n'),
    );
  }
  const failures = deletion.failed.length === 0 ? [] : ['Could not move to the trash:', ...deletion.failed.map((file) => `- ${file.path}: ${file.reason}`)];
  if (deletion.deleted.length === 0) {
    return errorResult(['Nothing was deleted.', ...failures].join('\n'));
  }
  const restorable = deletion.deleted.length === 1 ? 'it' : 'they';
  return textResult(
    [
      `Moved ${deletion.deleted.join(', ')} to the system trash; ${restorable} can be restored from there.`,
      ...describeBrokenUses(deletion),
      ...failures,
    ].join('\n'),
  );
}

function namedTargets(paths: readonly string[]): string {
  const [onlyPath] = paths;
  return paths.length === 1 && onlyPath !== undefined ? onlyPath : 'these files';
}

function describeBrokenUses(usages: FileUsages): string[] {
  return [
    ...(usages.used_by.length === 0 ? [] : ['These files still refer to the deleted files:', ...formatUsers(usages.used_by)]),
    ...(usages.settings.length === 0 ? [] : [`Cleared project settings: ${usages.settings.map((setting) => setting.name).join(', ')}`]),
    ...(usages.code.length === 0 ? [] : ['Scripts still name the deleted files:', ...formatCodeMentions(usages.code)]),
  ];
}
