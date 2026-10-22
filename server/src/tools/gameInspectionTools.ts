import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { applyReportSchema, formatApplyReport, formatNodePath, formatPropertyList, type PropertyList, propertyListSchema } from './formatting/propertyReports.js';
import { formatSceneTree, type SceneTreeResult, sceneTreeResultSchema } from './formatting/sceneTree.js';
import { propertyValues } from './parameters.js';
import { errorResult, textResult } from './results.js';

const waitAllowanceMs = 75_000;

const gameNodePath = z
  .string()
  .min(1)
  .describe('Path of the node in the running game: relative to the current scene, such as "Player"; "." for the scene root; or absolute, such as "/root/GameState" for an autoload.');

const updatedGameNodeSchema = applyReportSchema.extend({ scene: z.string(), path: z.string() });

type UpdatedGameNode = z.infer<typeof updatedGameNodeSchema>;

const waitResultSchema = z.object({
  met: z.boolean().optional(),
  value: z.unknown().optional(),
  frames: z.number().optional(),
  physics_frames: z.number().optional(),
  waited_ms: z.number(),
});

type WaitResult = z.infer<typeof waitResultSchema>;

const gameGetTreeInput = z.object({
  path: z
    .string()
    .optional()
    .describe('Show only this subtree: a path relative to the current scene, such as "Enemies", or "/root" for the whole tree with the autoloads. Default: the current scene.'),
  max_depth: z.number().int().min(0).max(64).default(8).describe('How many levels below the first node to show.'),
  max_nodes: z.number().int().min(1).max(2000).default(200).describe('The most nodes to list; hidden children are counted.'),
});

export function createGameGetTreeTool(game: EditorGateway): BridgeTool<typeof gameGetTreeInput, SceneTreeResult> {
  return new BridgeTool(game, {
    name: 'game_get_tree',
    definition: {
      title: 'Running game tree',
      description:
        'Show the node tree of the running game, including nodes it created while running, such as spawned enemies or bullets: names, types, scripts, instanced scenes and groups. Needs a game started from the editor.',
      inputSchema: gameGetTreeInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.get_tree',
    responseSchema: sceneTreeResultSchema,
    present: (tree) => textResult(formatSceneTree({ ...tree, scene: tree.scene === '' ? 'The running game' : `The running game, current scene ${tree.scene}` })),
  });
}

const gameGetPropertiesInput = z.object({
  path: gameNodePath,
  names: z
    .array(z.string())
    .optional()
    .describe(
      'Properties to read, such as ["position", "velocity"]. Methods without arguments whose names start with is_, get_, has_ or can_ can be read too, such as "is_on_floor()". Default: every property whose value differs from its default.',
    ),
  include_defaults: z.boolean().default(false).describe('Without names, also list properties at their default values. The list gets long.'),
});

export function createGameGetPropertiesTool(game: EditorGateway): BridgeTool<typeof gameGetPropertiesInput, PropertyList> {
  return new BridgeTool(game, {
    name: 'game_get_properties',
    definition: {
      title: 'Running game properties',
      description:
        'Read properties of a node in the running game, like the remote inspector: positions, velocities, health, and getters such as is_on_floor(). Use it to check what the game is doing after game_run or game_wait. Needs a game started from the editor.',
      inputSchema: gameGetPropertiesInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.get_properties',
    responseSchema: propertyListSchema,
    present: (list) => textResult(formatPropertyList({ ...list, scene: 'the running game' })),
  });
}

const gameSetPropertiesInput = z.object({
  path: gameNodePath,
  properties: propertyValues,
});

export function createGameSetPropertiesTool(game: EditorGateway): BridgeTool<typeof gameSetPropertiesInput, UpdatedGameNode> {
  return new BridgeTool(game, {
    name: 'game_set_properties',
    definition: {
      title: 'Set running game properties',
      description:
        'Change properties of a node in the running game to try something out, such as moving the player or raising its speed. The change lasts until the game stops; scene files stay as they are. Every value is read back. Needs a game started from the editor.',
      inputSchema: gameSetPropertiesInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'game.set_properties',
    responseSchema: updatedGameNodeSchema,
    present: (updated) => {
      const node = formatNodePath(updated.path);
      const report = formatApplyReport(updated);
      if (updated.applied.length === 0) {
        return errorResult(`No property of ${node} in the running game took the requested value.\n${report}`);
      }
      return textResult(`Updated ${node} in the running game. The change lasts until the game stops; scene files stay as they are.\n${report}`);
    },
  });
}

const gameWaitInput = z.object({
  condition: z
    .string()
    .min(1)
    .optional()
    .describe('Wait until this Godot expression is true on the node, such as "is_on_floor()" or "position.y < 0.1". It is checked every physics frame.'),
  node: z.string().optional().describe('The node the condition is evaluated on, such as "Player". Default: the current scene root.'),
  timeout_ms: z.number().int().min(1).max(60_000).default(10_000).describe('How long to wait for the condition before giving up. Default: 10 seconds.'),
  physics_frames: z.number().int().min(1).max(36_000).optional().describe('Instead of a condition, wait this many physics frames (60 per second by default).'),
  frames: z.number().int().min(1).max(36_000).optional().describe('Instead of a condition, wait this many rendered frames.'),
  ms: z.number().int().min(1).max(60_000).optional().describe('Instead of a condition, wait this many milliseconds.'),
});

export function createGameWaitTool(game: EditorGateway): BridgeTool<typeof gameWaitInput, WaitResult> {
  return new BridgeTool(game, {
    name: 'game_wait',
    definition: {
      title: 'Wait in the game',
      description:
        'Wait in the running game until a condition holds on a node, such as "is_on_floor()" on Player, or for a number of physics frames, frames or milliseconds. Pass exactly one of condition, physics_frames, frames or ms. Needs a game started from the editor.',
      inputSchema: gameWaitInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.wait',
    responseSchema: waitResultSchema,
    timeoutMs: waitAllowanceMs,
    present: (result, input) => textResult(describeWait(result, input)),
  });
}

function describeWait(result: WaitResult, input: z.output<typeof gameWaitInput>): string {
  if (input.condition !== undefined) {
    const node = input.node === undefined ? 'the scene root' : input.node;
    if (result.met === true) {
      return `"${input.condition}" became true on ${node} after ${String(result.waited_ms)} ms (${String(result.physics_frames ?? 0)} physics frames).`;
    }
    return `"${input.condition}" was still not true on ${node} after ${String(result.waited_ms)} ms; its last value was ${describeValue(result.value)}.`;
  }
  if (result.physics_frames !== undefined) {
    return `Waited ${String(result.physics_frames)} physics frames (${String(result.waited_ms)} ms).`;
  }
  if (result.frames !== undefined) {
    return `Waited ${String(result.frames)} frames (${String(result.waited_ms)} ms).`;
  }
  return `Waited ${String(result.waited_ms)} ms.`;
}

function describeValue(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
