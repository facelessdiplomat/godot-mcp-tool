import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { autoloadSchema, formatAutoloads } from './projectTools.js';
import { textResult } from './results.js';

const autoloadChangeSchema = z.object({ name: z.string(), path: z.string(), autoloads: z.array(autoloadSchema) });

type AutoloadChange = z.infer<typeof autoloadChangeSchema>;

const autoloadName = z.string().min(1).describe('The global name of the autoload that scripts use, such as "GameState".');

const autoloadAddInput = z.object({
  name: autoloadName,
  path: z
    .string()
    .min(1)
    .describe('The script or scene to create when the game starts, as a res:// path, such as "res://autoload/game_state.gd". A script must extend Node.'),
});

export function createAutoloadAddTool(editor: EditorGateway): BridgeTool<typeof autoloadAddInput, AutoloadChange> {
  return new BridgeTool(editor, {
    name: 'autoload_add',
    definition: {
      title: 'Add autoload',
      description:
        'Register a script or scene as an autoload: Godot creates it when the game starts and keeps it as a global node that every script reaches by its name, such as GameState.score. Use it for game-wide state, settings and managers. Saves project.godot at once.',
      inputSchema: autoloadAddInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'autoload.add',
    responseSchema: autoloadChangeSchema,
    present: (added) =>
      textResult(
        [
          `Added the autoload ${added.name} → ${added.path} and saved project.godot; scripts reach it as ${added.name} from the next game run.`,
          `Autoloads: ${formatAutoloads(added.autoloads)}`,
        ].join('\n'),
      ),
  });
}

const autoloadRemoveInput = z.object({ name: autoloadName });

export function createAutoloadRemoveTool(editor: EditorGateway): BridgeTool<typeof autoloadRemoveInput, AutoloadChange> {
  return new BridgeTool(editor, {
    name: 'autoload_remove',
    definition: {
      title: 'Remove autoload',
      description:
        'Remove an autoload from the project and save project.godot. Its script or scene file stays; scripts that use the autoload name fail until they are changed.',
      inputSchema: autoloadRemoveInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'autoload.remove',
    responseSchema: autoloadChangeSchema,
    present: (removed) =>
      textResult(
        [
          `Removed the autoload ${removed.name} (${removed.path}) and saved project.godot. Scripts that still use ${removed.name} fail now; check them with script_validate.`,
          `Autoloads: ${formatAutoloads(removed.autoloads)}`,
        ].join('\n'),
      ),
  });
}
