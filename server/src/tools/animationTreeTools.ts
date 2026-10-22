import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { errorResult, textResult } from './results.js';

const stateSchema = z.object({ name: z.string(), animation: z.string().optional(), type: z.string().optional() });

const transitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  advance: z.string(),
  switch: z.string(),
  xfade: z.number(),
  condition: z.string().optional(),
  expression: z.string().optional(),
  priority: z.number().int().optional(),
});

type Transition = z.infer<typeof transitionSchema>;

const animationTreeSchema = z.object({
  scene: z.string(),
  tree: z.string(),
  player: z.string(),
  active: z.boolean(),
  expression_base: z.string(),
  root: z.string(),
  states: z.array(stateSchema).optional(),
  transitions: z.array(transitionSchema).optional(),
  conditions: z.array(z.string()).optional(),
});

type AnimationTreeDescription = z.infer<typeof animationTreeSchema>;

const stateMachineChangeSchema = z.object({
  scene: z.string(),
  tree: z.string(),
  player: z.string(),
  states: z.array(stateSchema),
  transitions: z.array(transitionSchema),
  rejected: z.array(z.object({ item: z.string(), reason: z.string() })),
  warnings: z.array(z.string()),
});

const treePath = z.string().min(1).describe('Path of the AnimationTree relative to the scene root, such as "AnimationTree" or "Player/AnimationTree".');
const sceneToUse = z
  .string()
  .optional()
  .describe('The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.');

const animationTreeGetInput = z.object({ tree: treePath, scene: sceneToUse });

export function createAnimationTreeGetTool(editor: EditorGateway): BridgeTool<typeof animationTreeGetInput, AnimationTreeDescription> {
  return new BridgeTool(editor, {
    name: 'animation_tree_get',
    definition: {
      title: 'Read animation tree',
      description:
        'Read an AnimationTree: the AnimationPlayer it takes animations from, whether it is active, and for a state machine its states, the transitions between them with their conditions and expressions, and the condition parameters that scripts set.',
      inputSchema: animationTreeGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'animation_tree.get',
    responseSchema: animationTreeSchema,
    present: (tree) => textResult(describeTree(tree)),
  });
}

function describeTree(tree: AnimationTreeDescription): string {
  const player = tree.player === '' ? 'no AnimationPlayer yet' : `animations from ${tree.player}`;
  const lines = [`${tree.tree} in ${tree.scene}: ${player}, ${tree.active ? 'active' : 'inactive'}, expressions run on ${tree.expression_base}`];
  if (tree.root === '') {
    lines.push('No tree root yet; set up a state machine with animation_tree_set.');
    return lines.join('\n');
  }
  if (tree.states === undefined) {
    lines.push(`Tree root: ${tree.root}; only state machines are shown in detail.`);
    return lines.join('\n');
  }
  lines.push(describeStates(tree.states), ...describeTransitions(tree.transitions ?? []));
  const conditions = tree.conditions ?? [];
  if (conditions.length > 0) {
    lines.push(`Conditions: ${conditions.join(', ')}, set as parameters/conditions/<name>`);
  }
  return lines.join('\n');
}

const stateInput = z.object({
  name: z.string().min(1).describe('Name of the state, such as "walk".'),
  animation: z.string().min(1).describe('The animation of the AnimationPlayer that the state plays, such as "walk".'),
});

const transitionInput = z.object({
  from: z.string().min(1).describe('The state the transition leaves; "Start" for the entry of the machine.'),
  to: z.string().min(1).describe('The state the transition enters; "End" for the exit of the machine.'),
  condition: z.string().min(1).optional().describe('Take the transition when parameters/conditions/<condition> is true, such as "moving".'),
  expression: z
    .string()
    .min(1)
    .optional()
    .describe('Take the transition when this Godot expression is true, evaluated on the node in the tree\'s advance_expression_base_node, such as "velocity.length() > 0.1".'),
  advance: z
    .enum(['auto', 'enabled', 'disabled'])
    .optional()
    .describe('auto takes the transition by itself, enabled only when travel() asks for it, disabled never. Default: auto from Start and with a condition or expression, enabled otherwise.'),
  switch: z.enum(['immediate', 'sync', 'at_end']).optional().describe('When to switch: immediate (default), sync keeps the play position, at_end waits for the animation to end.'),
  xfade: z.number().min(0).optional().describe('Cross-fade time in seconds. Default: 0.'),
  priority: z.number().int().min(0).max(32).optional().describe('Lower numbers win when several transitions could be taken. Default: 1.'),
});

const animationTreeSetInput = z.object({
  tree: treePath,
  player: z
    .string()
    .min(1)
    .optional()
    .describe('Path of the AnimationPlayer whose animations the states play, relative to the scene root. Default: the one the tree already uses.'),
  states: z
    .array(stateInput)
    .min(1)
    .describe('The states, each playing one animation of the AnimationPlayer, such as [{"name": "idle", "animation": "idle"}, {"name": "walk", "animation": "walk"}].'),
  transitions: z
    .array(transitionInput)
    .optional()
    .describe('Transitions between the states. The machine begins at Start, so give one from Start to the first state. Default: none.'),
  scene: sceneToUse,
});

export function createAnimationTreeSetTool(editor: EditorGateway): BridgeTool<typeof animationTreeSetInput, z.infer<typeof stateMachineChangeSchema>> {
  return new BridgeTool(editor, {
    name: 'animation_tree_set',
    definition: {
      title: 'Set up animation state machine',
      description:
        'Set up an AnimationTree as a state machine, as one Undo step: states that each play an animation of the AnimationPlayer, and transitions between them, such as {"from": "Start", "to": "idle"} and {"from": "idle", "to": "walk", "condition": "moving", "xfade": 0.2}. It replaces the tree root; states or transitions the editor cannot use are rejected with the reason and the rest are kept. Scripts switch states by setting conditions, such as $AnimationTree.set("parameters/conditions/moving", true), or with travel("walk") on parameters/playback. In the running game, set a condition with game_set_properties on the AnimationTree and wait for a state with game_wait and the condition get("parameters/playback").get_current_node() == "walk".',
      inputSchema: animationTreeSetInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'animation_tree.set',
    responseSchema: stateMachineChangeSchema,
    present: (change) => {
      const rejected = change.rejected.length === 0 ? [] : ['Rejected:', ...change.rejected.map((rejection) => `- ${rejection.item}: ${rejection.reason}`)];
      if (change.states.length === 0) {
        return errorResult([`The state machine of ${change.tree} was not set up: no state could be used.`, ...rejected].join('\n'));
      }
      return textResult(
        [
          `Set up the state machine of ${change.tree} in ${change.scene} with animations from ${change.player} as one Undo step; the scene has unsaved changes.`,
          describeStates(change.states),
          ...describeTransitions(change.transitions),
          ...change.warnings.map((warning) => `Warning: ${warning}`),
          ...rejected,
        ].join('\n'),
      );
    },
  });
}

function describeStates(states: readonly z.infer<typeof stateSchema>[]): string {
  return `States: ${states.map((state) => `${state.name} (${state.animation === undefined ? (state.type ?? 'state') : `animation ${state.animation}`})`).join(', ')}`;
}

function describeTransitions(transitions: readonly Transition[]): string[] {
  if (transitions.length === 0) {
    return ['Transitions: none'];
  }
  return ['Transitions:', ...transitions.map(describeTransition)];
}

function describeTransition(transition: Transition): string {
  const trigger = transition.condition ?? transition.expression;
  const parts = [trigger === undefined ? transition.advance : `${transition.advance} when ${trigger}`, transition.switch];
  if (transition.xfade > 0) {
    parts.push(`xfade ${String(transition.xfade)} s`);
  }
  if (transition.priority !== undefined) {
    parts.push(`priority ${String(transition.priority)}`);
  }
  return `- ${transition.from} -> ${transition.to}: ${parts.join(', ')}`;
}
