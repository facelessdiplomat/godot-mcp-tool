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
  emitted: z.boolean().optional(),
  arguments: z.array(z.unknown()).optional(),
  frames: z.number().optional(),
  physics_frames: z.number().optional(),
  waited_ms: z.number(),
  paused: z.boolean(),
  game_frame: z.number(),
});

type WaitResult = z.infer<typeof waitResultSchema>;

const gameGetTreeInput = z.object({
  path: z
    .string()
    .optional()
    .describe('Show only this subtree: a path relative to the current scene, such as "Enemies", or "/root" for the whole tree with the autoloads. Default: the current scene.'),
  max_depth: z.number().int().min(0).max(64).default(8).describe('How many levels below the first node to show.'),
  max_nodes: z.number().int().min(1).max(2000).default(200).describe('The most nodes to list; hidden children are counted.'),
  controls: z
    .boolean()
    .optional()
    .describe(
      'List the visible controls instead: buttons, labels, text fields, sliders and bars, with their rectangles in game-view pixels, their text and whether they are disabled, pressed or focused, so that a menu can be read and clicked without a screenshot.',
    ),
});

const listedControlSchema = z.object({
  path: z.string(),
  type: z.string(),
  rect: z.array(z.number()),
  focused: z.boolean(),
  text: z.string().optional(),
  disabled: z.boolean().optional(),
  pressed: z.boolean().optional(),
  value: z.number().optional(),
});

type ListedControl = z.infer<typeof listedControlSchema>;

const gameControlsSchema = z.object({ scene: z.string(), controls: z.array(listedControlSchema), total: z.number(), truncated: z.boolean() });

type GameControls = z.infer<typeof gameControlsSchema>;

export function createGameGetTreeTool(game: EditorGateway): BridgeTool<typeof gameGetTreeInput, SceneTreeResult | GameControls> {
  return new BridgeTool(game, {
    name: 'game_get_tree',
    definition: {
      title: 'Running game tree',
      description:
        'Show the node tree of the running game, including nodes it created while running, such as spawned enemies or bullets: names, types, scripts, instanced scenes and groups. With controls: true, list the visible buttons, labels and other controls with their rectangles and states instead. Needs a game started with game_run, with or without the editor.',
      inputSchema: gameGetTreeInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.get_tree',
    responseSchema: z.union([gameControlsSchema, sceneTreeResultSchema]),
    present: (tree) =>
      textResult('controls' in tree ? describeControls(tree) : formatSceneTree({ ...tree, scene: tree.scene === '' ? 'The running game' : `The running game, current scene ${tree.scene}` })),
  });
}

function describeControls(listed: GameControls): string {
  const game = listed.scene === '' ? 'the running game' : `the running game, current scene ${listed.scene}`;
  if (listed.controls.length === 0) {
    return `No control of ${game} is visible.`;
  }
  const lines = [`Visible controls of ${game}, with their rectangles [x, y, width, height] in game-view pixels:`, ...listed.controls.map(describeControl)];
  if (listed.truncated) {
    lines.push(`Showing ${String(listed.controls.length)} of ${String(listed.total)}; pass path to list one part of the interface, or raise max_nodes.`);
  }
  const clickable = listed.controls.find((control) => control.disabled === false) ?? listed.controls[0];
  if (clickable !== undefined) {
    lines.push(`Click one with game_input, such as {"click": "${clickable.path}"}.`);
  }
  return lines.join('\n');
}

function describeControl(control: ListedControl): string {
  const parts = [`${control.path}: ${control.type}`];
  if (control.text !== undefined) {
    parts.push(JSON.stringify(control.text));
  }
  if (control.value !== undefined) {
    parts.push(`value ${String(control.value)}`);
  }
  parts.push(`[${control.rect.join(', ')}]`);
  const states = [control.disabled === true ? 'disabled' : undefined, control.pressed === true ? 'pressed' : undefined, control.focused ? 'focused' : undefined].filter(
    (state) => state !== undefined,
  );
  return states.length === 0 ? parts.join(' ') : `${parts.join(' ')}, ${states.join(', ')}`;
}

const gameGetPropertiesInput = z.object({
  path: gameNodePath,
  names: z
    .array(z.string())
    .optional()
    .describe(
      'Properties to read, such as ["position", "velocity"], or paths such as "position:y" or "mesh:size". Methods without arguments whose names start with is_, get_, has_ or can_ can be read too, such as "is_on_floor()". Default: every property whose value differs from its default.',
    ),
  include_defaults: z.boolean().default(false).describe('Without names, also list properties at their default values. The list gets long.'),
});

export function createGameGetPropertiesTool(game: EditorGateway): BridgeTool<typeof gameGetPropertiesInput, PropertyList> {
  return new BridgeTool(game, {
    name: 'game_get_properties',
    definition: {
      title: 'Running game properties',
      description:
        'Read properties of a node in the running game, like the remote inspector: positions, velocities, health, and getters such as is_on_floor(). Use it to check what the game is doing after game_run or game_wait. Needs a game started with game_run, with or without the editor.',
      inputSchema: gameGetPropertiesInput,
      annotations: readingAnnotations,
      alwaysLoad: true,
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
        'Change properties of a node in the running game to try something out, such as moving the player or raising its speed, including variables of its script without @export, such as a score; a setter of the variable runs. The change lasts until the game stops; scene files stay as they are. Every value is read back. Needs a game started with game_run, with or without the editor.',
      inputSchema: gameSetPropertiesInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'game.set_properties',
    responseSchema: updatedGameNodeSchema,
    present: (updated, input) => {
      const node = formatNodePath(updated.path);
      const report = [formatApplyReport(updated), ...(keepsItsWindowSize(updated) ? [windowSizeHint(input.properties['size'])] : [])].join('\n');
      if (updated.applied.length === 0) {
        return errorResult(`No property of ${node} in the running game took the requested value.\n${report}`);
      }
      return textResult(`Updated ${node} in the running game. The change lasts until the game stops; scene files stay as they are.\n${report}`);
    },
  });
}

const gameWindowPath = '/root';
const windowSizeProperty = 'size';
const exampleWindowSize = [1280, 720];

function keepsItsWindowSize(updated: UpdatedGameNode): boolean {
  const refused = [...updated.rejected.map((rejection) => rejection.name), ...updated.not_applied.map((mismatch) => mismatch.name)];
  return updated.path === gameWindowPath && refused.includes(windowSizeProperty);
}

function windowSizeHint(requested: unknown): string {
  const size = Array.isArray(requested) && requested.length === 2 && requested.every((side) => typeof side === 'number') ? requested : exampleWindowSize;
  return `The game window keeps the size it started with: to try another size, run the game again with window_size in game_run, such as [${size.join(', ')}].`;
}

const gameWaitInput = z.object({
  condition: z
    .string()
    .min(1)
    .optional()
    .describe('Wait until this Godot expression is true on the node, such as "is_on_floor()" or "position.y < 0.1". It is checked after every physics frame.'),
  signal: z
    .string()
    .min(1)
    .optional()
    .describe('Instead of a condition, wait until the node emits this signal, such as "died" or "landed", and return its arguments.'),
  node: z.string().optional().describe('The node the condition is evaluated on, or that emits the signal, such as "Player". Default: the current scene root.'),
  timeout_ms: z.number().int().min(1).max(60_000).default(10_000).describe('How long to wait for the condition or the signal before giving up. Default: 10 seconds.'),
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
        'Wait in the running game until a condition holds on a node, such as "is_on_floor()" on Player, until a node emits a signal, such as "died", or for a number of physics frames, frames or milliseconds. Pass exactly one of condition, signal, physics_frames, frames or ms. While game_pause holds the game, game_wait plays it until then and pauses it again on that frame, such as at the top of a jump with "velocity.y <= 0". Needs a game started with game_run, with or without the editor.',
      inputSchema: gameWaitInput,
      annotations: readingAnnotations,
      alwaysLoad: true,
    },
    method: 'game.wait',
    responseSchema: waitResultSchema,
    timeoutMs: waitAllowanceMs,
    present: (result, input) => textResult(result.paused ? `${describeWait(result, input)} The game is paused again at its physics frame ${String(result.game_frame)}.` : describeWait(result, input)),
  });
}

function describeWait(result: WaitResult, input: z.output<typeof gameWaitInput>): string {
  if (input.signal !== undefined) {
    const node = input.node === undefined ? 'The scene root' : input.node;
    if (result.emitted === true) {
      const emittedArguments = result.arguments === undefined || result.arguments.length === 0 ? '' : ` with ${JSON.stringify(result.arguments)}`;
      return `${node} emitted ${input.signal} after ${String(result.waited_ms)} ms (${String(result.physics_frames ?? 0)} physics frames)${emittedArguments}.`;
    }
    return `${node} did not emit ${input.signal} within ${String(result.waited_ms)} ms.`;
  }
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
