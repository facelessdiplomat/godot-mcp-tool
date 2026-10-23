import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { formatSceneTree, type SceneTreeResult, sceneTreeResultSchema } from './formatting/sceneTree.js';
import { sceneToRead } from './parameters.js';
import { textResult } from './results.js';

const openedSceneSchema = z.object({
  scene: z.string(),
  root: z.object({ name: z.string(), type: z.string() }),
});

type OpenedScene = z.infer<typeof openedSceneSchema>;

const savedScenesSchema = z.object({ saved: z.array(z.string()), scripts: z.array(z.string()) });

type SavedScenes = z.infer<typeof savedScenesSchema>;

const sceneGetTreeInput = z.object({
  scene: sceneToRead,
  max_depth: z.number().int().min(0).max(64).default(8).describe('How many levels below the root to show.'),
  max_nodes: z.number().int().min(1).max(2000).default(200).describe('The most nodes to list; hidden children are counted.'),
});

export function createSceneGetTreeTool(editor: EditorGateway): BridgeTool<typeof sceneGetTreeInput, SceneTreeResult> {
  return new BridgeTool(editor, {
    name: 'scene_get_tree',
    definition: {
      title: 'Scene tree',
      description:
        'Show the node tree of a scene as compact text: node names and types, attached scripts, instanced scenes and groups. Use it before changing a scene to learn the node paths that the node tools take. Reads the scene open in the editor by default, or any scene by its res:// path.',
      inputSchema: sceneGetTreeInput,
      annotations: readingAnnotations,
      alwaysLoad: true,
    },
    method: 'scene.get_tree',
    responseSchema: sceneTreeResultSchema,
    present: (tree) => textResult(formatSceneTree(tree)),
  });
}

const sceneCreateInput = z.object({
  path: z.string().describe('Where to save the new scene, such as "res://levels/arena.tscn". The file must not exist yet; missing folders are created.'),
  root_type: z
    .string()
    .describe('Type of the root node: an engine class such as "Node3D", a class_name from the project, or a res://….tscn path to create a scene inherited from it.'),
  root_name: z.string().optional().describe('Name of the root node. Default: the file name in PascalCase, so "arena.tscn" gets "Arena".'),
});

export function createSceneCreateTool(editor: EditorGateway): BridgeTool<typeof sceneCreateInput, OpenedScene> {
  return new BridgeTool(editor, {
    name: 'scene_create',
    definition: {
      title: 'Create scene',
      description:
        'Create a new scene file with a root node, save it and open it in the editor, so the scene and node tools work on it next. A 3D level usually has a "Node3D" root; pass a res://….tscn path as root_type to inherit from another scene.',
      inputSchema: sceneCreateInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'scene.create',
    responseSchema: openedSceneSchema,
    present: ({ scene, root }) =>
      textResult(`Created ${scene} with the root ${root.name} (${root.type}) and opened it in the editor. It is saved; later changes need scene_save.`),
  });
}

const sceneOpenInput = z.object({
  path: z.string().describe('The scene to open, such as "res://levels/arena.tscn", or "main" for the main scene of the project.'),
});

export function createSceneOpenTool(editor: EditorGateway): BridgeTool<typeof sceneOpenInput, OpenedScene> {
  return new BridgeTool(editor, {
    name: 'scene_open',
    definition: {
      title: 'Open scene',
      description:
        'Open a scene in the editor and make it the current scene, which the scene and node tools use when no scene is given. Tools that change a scene open it themselves, so this is mainly for choosing the default scene or showing a scene to the user.',
      inputSchema: sceneOpenInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'scene.open',
    responseSchema: openedSceneSchema,
    present: ({ scene, root }) => textResult(`Opened ${scene} (root ${root.name}: ${root.type}).`),
  });
}

const sceneSaveInput = z.object({
  scene: z.string().optional().describe('The scene to save, as a res:// path or "main" for the main scene of the project. Default: the scene currently open in the editor.'),
  all: z.boolean().default(false).describe('Save every open scene instead of one.'),
});

export function createSceneSaveTool(editor: EditorGateway): BridgeTool<typeof sceneSaveInput, SavedScenes> {
  return new BridgeTool(editor, {
    name: 'scene_save',
    definition: {
      title: 'Save scene',
      description:
        'Save scenes from the editor to disk: the current scene, a given scene, or all open scenes. Changes made with the scene and node tools stay unsaved until then, as in the editor. Save when a logical change is complete. Refuses with a conflict when a script changed on disk while the editor has unsaved changes to it.',
      inputSchema: sceneSaveInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: true,
    },
    method: 'scene.save',
    responseSchema: savedScenesSchema,
    present: (result) => textResult(describeSavedScenes(result)),
  });
}

function describeSavedScenes({ saved, scripts }: SavedScenes): string {
  const lines = [describeScenes(saved)];
  if (scripts.length > 0) {
    lines.push(`The editor also saved unsaved changes from its script editor to ${scripts.join(', ')}; read the files again before editing them.`);
  }
  return lines.join('\n');
}

function describeScenes(saved: readonly string[]): string {
  if (saved.length === 0) {
    return 'No scenes are open, so nothing was saved.';
  }
  if (saved.length === 1) {
    return `Saved ${saved.join('')}.`;
  }
  return `Saved ${String(saved.length)} scenes: ${saved.join(', ')}.`;
}

const closedSceneSchema = z.object({ closed: z.string(), saved: z.boolean(), discarded_changes: z.boolean(), current: z.string() });

type ClosedScene = z.infer<typeof closedSceneSchema>;

const sceneCloseInput = z.object({
  scene: z.string().optional().describe('The scene to close, as a res:// path or "main" for the main scene of the project. Default: the scene currently open in the editor.'),
  unsaved: z
    .enum(['save', 'discard'])
    .optional()
    .describe('What to do with unsaved changes: "save" saves them first, "discard" drops them. Without it, a scene with unsaved changes stays open.'),
});

export function createSceneCloseTool(editor: EditorGateway): BridgeTool<typeof sceneCloseInput, ClosedScene> {
  return new BridgeTool(editor, {
    name: 'scene_close',
    definition: {
      title: 'Close scene',
      description:
        'Close a scene in the editor: the one named, or the one open now. A scene with unsaved changes stays open unless unsaved says to save them first or to discard them.',
      inputSchema: sceneCloseInput,
      annotations: changingAnnotations({ destructive: true, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'scene.close',
    responseSchema: closedSceneSchema,
    present: (closed) => {
      const changes = closed.saved ? ' after saving it' : closed.discarded_changes ? ' without its unsaved changes' : '';
      const now = closed.current === '' ? 'No scene is open now.' : `The editor shows ${closed.current} now.`;
      return textResult(`Closed ${closed.closed}${changes}. ${now}`);
    },
  });
}
