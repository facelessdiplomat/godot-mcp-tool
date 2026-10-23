import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { type CaptureReader, captureSchema, describeGameCapture, presentCapture, screenshotAllowanceMs } from './captureTools.js';
import { errorResult, textResult } from './results.js';

const defaultDeadzone = 0.2;
const physicsFramesPerSecond = 60;
const tapPhysicsFrames = 2;
const inputAllowanceMs = 15_000;

const describedEventSchema = z.object({ type: z.string(), text: z.string() });

const inputActionSchema = z.object({ name: z.string(), deadzone: z.number(), events: z.array(describedEventSchema) });

type InputAction = z.infer<typeof inputActionSchema>;

const inputMapSchema = z.object({
  actions: z.array(inputActionSchema),
  unknown: z.array(z.object({ name: z.string(), reason: z.string() })),
});

type InputMap = z.infer<typeof inputMapSchema>;

const inputMapChangeSchema = z.object({
  applied: z.array(z.string()),
  removed: z.array(z.string()),
  rejected: z.array(z.object({ name: z.string(), reason: z.string() })),
  previous: z.record(z.string(), z.array(describedEventSchema).nullable()),
  actions: z.array(inputActionSchema),
});

type InputMapChange = z.infer<typeof inputMapChangeSchema>;

const playedInputSchema = z.object({
  steps: z.number(),
  waited_ms: z.number(),
  released: z.array(z.string()),
  held: z.array(z.string()),
  screenshot: captureSchema.optional(),
  screenshot_error: z.string().optional(),
});

type PlayedInput = z.infer<typeof playedInputSchema>;

const inputMapGetInput = z.object({
  actions: z.array(z.string()).optional().describe('Actions to show, such as ["move_forward", "jump"]. Default: every action of the project.'),
  include_builtin: z.boolean().default(false).describe('Also list the built-in ui_ actions, such as ui_accept.'),
});

export function createInputMapGetTool(editor: EditorGateway): BridgeTool<typeof inputMapGetInput, InputMap> {
  return new BridgeTool(editor, {
    name: 'input_map_get',
    definition: {
      title: 'Input actions',
      description:
        'List the input actions of the project (Project Settings → Input Map) with their keys, mouse buttons and joypad events. The built-in ui_ actions are left out unless include_builtin is true.',
      inputSchema: inputMapGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'input_map.get',
    responseSchema: inputMapSchema,
    present: (inputMap) => textResult(describeInputMap(inputMap)),
  });
}

function describeInputMap(inputMap: InputMap): string {
  const lines = [...inputMap.actions.map(describeAction), ...inputMap.unknown.map((unknown) => `${unknown.name}: ${unknown.reason}`)];
  if (lines.length === 0) {
    return 'The project has no input actions of its own yet. Add them with input_map_set; include_builtin: true lists the built-in ui_ actions.';
  }
  return lines.join('\n');
}

function describeAction(action: InputAction): string {
  const deadzone = Math.abs(action.deadzone - defaultDeadzone) < 1e-6 ? '' : ` (deadzone ${String(action.deadzone)})`;
  return `${action.name}: ${describeEvents(action.events)}${deadzone}`;
}

function describeEvents(events: readonly { readonly text: string }[]): string {
  return events.length === 0 ? 'no events' : events.map((event) => event.text).join(', ');
}

const eventDescription = z.union([z.string(), z.record(z.string(), z.unknown())]);

const inputMapSetInput = z.object({
  actions: z
    .record(z.string(), z.union([z.array(eventDescription), z.object({ events: z.array(eventDescription), deadzone: z.number().min(0).max(1).optional() }), z.null()]))
    .describe(
      'Action names mapped to their full list of events, such as {"move_forward": ["W", "Up"], "jump": ["Space", {"type": "joypad_button", "button": "a"}]}. Events: key names such as "W", "Space", "Up" or "Ctrl+S"; {"type": "mouse_button", "button": "left"}; {"type": "joypad_button", "button": "a"}; {"type": "joypad_motion", "axis": "left_y", "direction": -1}. Use {"events": [...], "deadzone": 0.3} to set the deadzone, and null to remove an action.',
    ),
});

export function createInputMapSetTool(editor: EditorGateway): BridgeTool<typeof inputMapSetInput, InputMapChange> {
  return new BridgeTool(editor, {
    name: 'input_map_set',
    definition: {
      title: 'Change input actions',
      description:
        'Create, change or remove input actions of the project and save project.godot. Give each action its full list of events; scripts then read it with Input.is_action_pressed("move_forward"). A game that is already running keeps its old actions until it starts again.',
      inputSchema: inputMapSetInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'input_map.set',
    responseSchema: inputMapChangeSchema,
    present: (change) => {
      if (change.applied.length === 0 && change.removed.length === 0) {
        return errorResult(['project.godot was not changed.', ...describeRejections(change)].join('\n'));
      }
      return textResult(describeInputMapChange(change));
    },
  });
}

function describeInputMapChange(change: InputMapChange): string {
  const lines = ['Saved project.godot.'];
  for (const action of change.actions) {
    const previous = change.previous[action.name];
    lines.push(`${action.name}: ${describeEvents(action.events)} ${previous === undefined || previous === null ? '(new)' : `(was ${describeEvents(previous)})`}`);
  }
  for (const removed of change.removed) {
    lines.push(`Removed ${removed} (was ${describeEvents(change.previous[removed] ?? [])})`);
  }
  lines.push(...describeRejections(change));
  lines.push('A game that is already running keeps its old actions until it starts again.');
  return lines.join('\n');
}

function describeRejections(change: InputMapChange): string[] {
  return change.rejected.length === 0 ? [] : ['Rejected:', ...change.rejected.map((rejection) => `- ${rejection.name}: ${rejection.reason}`)];
}

const holdDuration = {
  physics_frames: z.number().int().min(1).max(3600).optional().describe('How long to hold, in physics frames (60 per second by default). Default: 2.'),
  ms: z.number().int().min(1).max(60_000).optional().describe('How long to hold, in milliseconds.'),
};

const pressState = z.enum(['tap', 'down', 'up']).optional().describe('"tap" (default) presses, holds and releases; "down" only presses; "up" only releases.');

const actionStep = z.strictObject({
  action: z.string().min(1).describe('An input action of the project, such as "jump".'),
  strength: z.number().min(0).max(1).optional().describe('How strongly the action is pressed, from 0 to 1. Default: 1.'),
  state: pressState,
  ...holdDuration,
});

const keyStep = z.strictObject({
  key: z.string().min(1).describe('A key name, such as "W", "Space", "Escape" or "Ctrl+S".'),
  shift: z.boolean().optional().describe('Hold Shift with the key.'),
  ctrl: z.boolean().optional().describe('Hold Ctrl with the key.'),
  alt: z.boolean().optional().describe('Hold Alt with the key.'),
  meta: z.boolean().optional().describe('Hold Meta (Cmd on macOS) with the key.'),
  state: pressState,
  ...holdDuration,
});

const pointInView = z.array(z.number()).length(2);

const mouseMotionStep = z.strictObject({
  mouse_motion: pointInView.describe('Move the mouse by [dx, dy] pixels of the game view, such as for mouse look.'),
});

const clickStep = z.strictObject({
  click: pointInView.describe('Click at [x, y] in pixels of the game view, as in game screenshots.'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('The mouse button. Default: left.'),
  double: z.boolean().optional().describe('Double-click.'),
});

const textStep = z.strictObject({ text: z.string().min(1).describe('Type this text, as into a focused LineEdit.') });

const waitMillisecondsStep = z.strictObject({ wait_ms: z.number().int().min(1).max(60_000).describe('Wait this many milliseconds.') });

const waitPhysicsFramesStep = z.strictObject({
  wait_physics_frames: z.number().int().min(1).max(3600).describe('Wait this many physics frames.'),
});

const inputStep = z.union([actionStep, keyStep, mouseMotionStep, clickStep, textStep, waitMillisecondsStep, waitPhysicsFramesStep]);

type InputStep = z.infer<typeof inputStep>;

const gameInputInput = z.object({
  steps: z
    .array(inputStep)
    .min(1)
    .max(200)
    .describe(
      'Input to play in order, such as [{"action": "move_forward", "ms": 1000}, {"action": "jump"}, {"mouse_motion": [120, 0]}, {"click": [640, 360]}, {"wait_ms": 300}].',
    ),
  release_at_end: z.boolean().default(true).describe('Release every action and key that is still held after the last step. Default: true.'),
  screenshot: z
    .boolean()
    .default(false)
    .describe('Take a screenshot of the game window right after the last step, as game_screenshot does, so that it shows the moment the input ends.'),
});

export function createGameInputTool(game: EditorGateway, readCapture: CaptureReader): BridgeTool<typeof gameInputInput, PlayedInput> {
  return new BridgeTool(game, {
    name: 'game_input',
    definition: {
      title: 'Play input into the game',
      description:
        'Play input into the running game step by step: hold input actions or keys for a time, move and click the mouse, type text, wait. Use it to try gameplay, such as walking forward for a second and then jumping, then check the result with game_get_properties, game_wait, or a screenshot taken right after the last step (screenshot: true). Actions must exist in the project when the game starts. Needs a game started with game_run, with or without the editor.',
      inputSchema: gameInputInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'game.input',
    responseSchema: playedInputSchema,
    timeoutMs: ({ steps, screenshot }) =>
      inputAllowanceMs + (screenshot ? screenshotAllowanceMs : 0) + steps.reduce((total, step) => total + estimatedDurationMs(step), 0),
    present: (played) => presentPlayedInput(played, readCapture),
  });
}

function presentPlayedInput(played: PlayedInput, readCapture: CaptureReader): CallToolResult {
  const summary = describePlayedInput(played);
  if (played.screenshot !== undefined) {
    return presentCapture(played.screenshot, `${summary}\n${describeGameCapture(played.screenshot, true)}`, readCapture);
  }
  return textResult(played.screenshot_error === undefined ? summary : `${summary}\nNo screenshot: ${played.screenshot_error}`);
}

function estimatedDurationMs(step: InputStep): number {
  if ('wait_ms' in step) {
    return step.wait_ms;
  }
  if ('wait_physics_frames' in step) {
    return framesToMs(step.wait_physics_frames);
  }
  if ('action' in step || 'key' in step) {
    return step.ms ?? framesToMs(step.physics_frames ?? tapPhysicsFrames);
  }
  return framesToMs(tapPhysicsFrames);
}

function framesToMs(physicsFrames: number): number {
  return Math.ceil((physicsFrames * 1000) / physicsFramesPerSecond);
}

function describePlayedInput(played: PlayedInput): string {
  const lines = [`Played ${String(played.steps)} input ${played.steps === 1 ? 'step' : 'steps'} in ${String(played.waited_ms)} ms.`];
  if (played.released.length > 0) {
    lines.push(`Released at the end: ${played.released.join(', ')}.`);
  }
  const [firstHeld] = played.held;
  if (firstHeld !== undefined) {
    lines.push(`Still held: ${played.held.join(', ')}. Release it with ${releaseStepFor(firstHeld)}.`);
  }
  return lines.join('\n');
}

function releaseStepFor(heldLabel: string): string {
  const keyPrefix = 'key ';
  return heldLabel.startsWith(keyPrefix)
    ? `{"key": "${heldLabel.slice(keyPrefix.length)}", "state": "up"}`
    : `{"action": "${heldLabel}", "state": "up"}`;
}
