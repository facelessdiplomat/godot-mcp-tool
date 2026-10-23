import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { errorResult, textResult } from './results.js';

const animationSummarySchema = z.object({ name: z.string(), length: z.number(), loop: z.string(), tracks: z.number().int() });

const animationTrackSchema = z.object({
  path: z.string(),
  type: z.string(),
  interpolation: z.string(),
  update: z.string().optional(),
  key_count: z.number().int(),
  keys: z.array(z.object({ time: z.number(), value: z.unknown() })),
});

const animationDescriptionSchema = z.object({
  scene: z.string(),
  player: z.string(),
  root_node: z.string(),
  autoplay: z.string(),
  animations: z.array(animationSummarySchema).optional(),
  animation: z.object({ name: z.string(), length: z.number(), loop: z.string(), tracks: z.array(animationTrackSchema) }).optional(),
});

type AnimationDescription = z.infer<typeof animationDescriptionSchema>;

const animationChangeSchema = z.object({
  scene: z.string(),
  player: z.string(),
  name: z.string(),
  created: z.boolean(),
  length: z.number(),
  loop: z.string(),
  tracks: z.array(z.object({ path: z.string(), keys: z.number().int(), interpolation: z.string(), update: z.string(), from: z.unknown(), to: z.unknown() })),
  rejected: z.array(z.object({ path: z.string(), reason: z.string() })),
  reset_tracks: z.array(z.string()).default([]),
});

type AnimationChange = z.infer<typeof animationChangeSchema>;

const deletedAnimationSchema = z.object({ scene: z.string(), player: z.string(), name: z.string() });

const playerPath = z
  .string()
  .min(1)
  .describe('Path of the AnimationPlayer relative to the scene root, such as "AnimationPlayer" or "Door/AnimationPlayer".');
const sceneToUse = z
  .string()
  .optional()
  .describe('The scene, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.');
const animationName = z
  .string()
  .min(1)
  .describe('Name of the animation, such as "open"; "library/name" for an animation of another library than the default one.');

const animationGetInput = z.object({
  player: playerPath,
  name: z.string().min(1).optional().describe('An animation to show with its tracks and keys. Default: list every animation of the player.'),
  scene: sceneToUse,
});

export function createAnimationGetTool(editor: EditorGateway): BridgeTool<typeof animationGetInput, AnimationDescription> {
  return new BridgeTool(editor, {
    name: 'animation_get',
    definition: {
      title: 'Read animations',
      description:
        "Read the animations of an AnimationPlayer: each animation's length, loop mode and track count, or with name the tracks of one animation with their node paths, interpolation and keys. Track paths are relative to the player's root_node, the parent of the player by default.",
      inputSchema: animationGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'animation.get',
    responseSchema: animationDescriptionSchema,
    present: (description) => textResult(describeAnimations(description)),
  });
}

function describeAnimations(description: AnimationDescription): string {
  const autoplay = description.autoplay === '' ? 'none' : description.autoplay;
  const lines = [`${description.player} in ${description.scene}: tracks animate nodes from ${description.root_node}, autoplay ${autoplay}`];
  if (description.animation !== undefined) {
    const animation = description.animation;
    lines.push(`${animation.name}: ${seconds(animation.length)}, loop ${animation.loop}`, ...animation.tracks.map(describeTrack));
    return lines.join('\n');
  }
  const animations = description.animations ?? [];
  if (animations.length === 0) {
    lines.push('Animations: none yet; create one with animation_set');
    return lines.join('\n');
  }
  lines.push(
    'Animations:',
    ...animations.map((animation) => `- ${animation.name}: ${seconds(animation.length)}, loop ${animation.loop}, ${String(animation.tracks)} ${animation.tracks === 1 ? 'track' : 'tracks'}`),
  );
  return lines.join('\n');
}

function describeTrack(track: z.infer<typeof animationTrackSchema>): string {
  const kind = [track.type, track.interpolation, ...(track.update === undefined ? [] : [track.update])].join(', ');
  const keys = track.keys.map((key) => `${seconds(key.time)} ${formatValue(key.value)}`).join('; ');
  const more = track.keys.length < track.key_count ? `; … ${String(track.keys.length)} of ${String(track.key_count)} keys shown` : '';
  return `- ${track.path} (${kind}): ${keys}${more}`;
}

const keySchema = z.object({
  time: z.number().min(0).describe('Seconds from the start of the animation.'),
  value: z.unknown().describe('The value, in the formats of node_set_properties, such as [0, 3, 0] for a Vector3 or true for visible.'),
});

const trackSchema = z.object({
  path: z.string().min(1).describe('Node and property, relative to the parent of the player: "Door:position", "Door:position:y", ".:visible" for the parent itself.'),
  keys: z.array(keySchema).min(1),
  interpolation: z
    .enum(['nearest', 'linear', 'cubic', 'linear_angle', 'cubic_angle'])
    .optional()
    .describe('How values blend between keys. Default: linear; linear_angle turns rotations the short way.'),
  update: z
    .enum(['continuous', 'discrete', 'capture'])
    .optional()
    .describe('continuous blends every frame, discrete changes at each key. Default: discrete for values that cannot blend, such as bool and text, continuous otherwise.'),
});

const animationSetInput = z.object({
  player: playerPath,
  name: animationName,
  length: z.number().positive().optional().describe('Length in seconds. Default: the time of the last key.'),
  loop: z.enum(['none', 'linear', 'pingpong']).optional().describe('none (default) plays once, linear repeats, pingpong goes back and forth.'),
  tracks: z.array(trackSchema).min(1).describe('One track per animated property, with all its keys.'),
  scene: sceneToUse,
});

export function createAnimationSetTool(editor: EditorGateway): BridgeTool<typeof animationSetInput, AnimationChange> {
  return new BridgeTool(editor, {
    name: 'animation_set',
    definition: {
      title: 'Create or replace animation',
      description:
        'Create or replace an animation of an AnimationPlayer from property tracks, as one Undo step: each track animates one property, such as {"path": "Door:position", "keys": [{"time": 0, "value": [0, 0, 0]}, {"time": 1, "value": [0, 3, 0]}]}, with a node path relative to the parent of the player and values in the formats of node_set_properties. A track the editor cannot use is rejected with the reason and the others are kept. Like the editor, it keys the current value of each newly animated property in the RESET animation, the pose that the other animations and AnimationTree blends start from; without it, a property that only some animations of a state machine animate would blend from zero. An animation plays when a script calls play("name") on the player or when the player\'s autoplay names it; check it in the running game with game_wait and game_get_properties.',
      inputSchema: animationSetInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'animation.set',
    responseSchema: animationChangeSchema,
    present: (change) => {
      const rejected = change.rejected.length === 0 ? [] : ['Rejected:', ...change.rejected.map((rejection) => `- ${rejection.path}: ${rejection.reason}`)];
      if (change.tracks.length === 0) {
        return errorResult([`The animation ${change.name} was not changed: no track could be used.`, ...rejected].join('\n'));
      }
      const verb = change.created ? 'Created' : 'Replaced';
      const summary = `${verb} the animation ${change.name} (${seconds(change.length)}, loop ${change.loop}) of ${change.player} in ${change.scene} as one Undo step; the scene has unsaved changes.`;
      const tracks = change.tracks.map(
        (track) => `- ${track.path}: ${String(track.keys)} ${track.keys === 1 ? 'key' : 'keys'} from ${formatValue(track.from)} to ${formatValue(track.to)}, ${track.interpolation}, ${track.update}`,
      );
      const reset =
        change.reset_tracks.length === 0
          ? []
          : [
              `Keyed the current ${change.reset_tracks.length === 1 ? 'value' : 'values'} of ${change.reset_tracks.join(', ')} in RESET, the pose that the other animations and AnimationTree blends start from.`,
            ];
      return textResult([summary, ...tracks, ...rejected, ...reset].join('\n'));
    },
  });
}

const animationDeleteInput = z.object({ player: playerPath, name: animationName, scene: sceneToUse });

export function createAnimationDeleteTool(editor: EditorGateway): BridgeTool<typeof animationDeleteInput, z.infer<typeof deletedAnimationSchema>> {
  return new BridgeTool(editor, {
    name: 'animation_delete',
    definition: {
      title: 'Delete animation',
      description: 'Delete an animation of an AnimationPlayer as one Undo step.',
      inputSchema: animationDeleteInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'animation.delete',
    responseSchema: deletedAnimationSchema,
    present: (deleted) => textResult(`Deleted the animation ${deleted.name} of ${deleted.player} in ${deleted.scene} as one Undo step; the scene has unsaved changes.`),
  });
}

function seconds(value: number): string {
  return `${String(value)} s`;
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
