import { extname } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { describeError } from '../util/errors.js';
import { readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { errorResult } from './results.js';

export type CaptureReader = (path: string) => Buffer;

export const screenshotAllowanceMs = 40_000;
const maximumViews = 6;
const viewPresets = ['front', 'back', 'left', 'right', 'top', 'iso'] as const;
const imageTypes: Readonly<Record<string, string>> = { '.png': 'image/png', '.jpg': 'image/jpeg' };

export const captureSchema = z.object({
  path: z.string(),
  width: z.number(),
  height: z.number(),
  original_width: z.number(),
  original_height: z.number(),
  scene: z.string(),
  views: z.array(z.string()),
  moments: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  note: z.string().optional(),
  comparison: z
    .object({
      earlier: z.string(),
      sizes_match: z.boolean(),
      earlier_size: z.array(z.number()),
      mean_difference: z.number(),
      changed_share: z.number(),
      changed_rect: z.array(z.number()).nullable(),
      tolerance: z.number(),
    })
    .optional(),
});

export type Capture = z.infer<typeof captureSchema>;

type Comparison = NonNullable<Capture['comparison']>;

const point = z.array(z.number()).length(3);

const viewTarget = z.string().min(1).optional().describe('A node to frame instead of the whole scene, such as "Player".');

const renderModes = ['unshaded', 'lighting', 'overdraw', 'wireframe', 'normals'] as const;

const viewSettings = {
  fov: z.number().min(1).max(179).optional().describe('Vertical field of view in degrees. Default: 50.'),
  label: z.string().min(1).optional().describe('Caption of the view in the image.'),
  render: z
    .enum(renderModes)
    .optional()
    .describe(
      'Draw this view as a debug view of the 3D viewport instead of with materials and light: "unshaded" shows colors without light, to tell a dark room from a black material; "lighting" shows only the light; "overdraw" shows where transparent surfaces pile up; "wireframe" shows the triangles (editor_screenshot only); "normals" shows the surface normals (Forward+ only).',
    ),
};

const view = z.union([
  z.enum(viewPresets),
  z.strictObject({ preset: z.enum(viewPresets), target: viewTarget, ...viewSettings }),
  z.strictObject({
    position: point.describe('Camera position [x, y, z] in world coordinates.'),
    look_at: point.optional().describe('The point the camera looks at. Default: the center of target, or of the whole scene.'),
    target: viewTarget,
    ...viewSettings,
  }),
]);

function viewsParameter(instead: string) {
  return z
    .array(view)
    .min(1)
    .max(maximumViews)
    .optional()
    .describe(
      `Render the 3D scene from these angles instead of ${instead}, up to ${String(maximumViews)} in one labelled image: a preset "front" (from +Z), "back", "left" (from -X), "right", "top" or "iso", framed on the whole scene; {"preset": "front", "target": "Player"} to frame one node; or {"position": [0, 8, 12], "look_at": [0, 0, 0]} for a camera at a point. Each view also takes "fov", "label" and "render", such as {"preset": "iso", "render": "unshaded"}.`,
    );
}

const imageSettings = {
  max_size: z.number().int().min(256).max(2560).default(1280).describe('The longest side of the image in pixels. Default: 1280.'),
  format: z.enum(['png', 'jpeg']).default('png').describe('png (default), or jpeg for a smaller file.'),
  compare_to: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Compare the new picture with an earlier one, by the path that an earlier screenshot gave (the last 100 are kept) or as an image of the project, such as "res://screenshots/level.png": the result says how much changed and where, and outlines the changes in the picture. Take both with the same views and size. Time, particles and temporal anti-aliasing make two runs differ; run the game with fixed_fps and take both at the same physics frame to compare runs.',
    ),
  tolerance: z
    .number()
    .min(0)
    .max(1)
    .default(0.1)
    .describe('With compare_to, how much a color channel may change, from 0 to 1, before its pixel counts as changed. Default: 0.1.'),
};

const gameScreenshotInput = z.object({
  views: viewsParameter('the game window'),
  frames: z
    .number()
    .int()
    .min(2)
    .max(6)
    .optional()
    .describe(
      'Instead of one moment, take this many screenshots of the game window, every_physics_frames apart, as one labelled image, to see motion such as a jump, an animation or a camera move. While game_pause holds the game, it plays exactly those frames and pauses again.',
    ),
  every_physics_frames: z.number().int().min(1).max(600).optional().describe('Physics frames between the screenshots of frames. Default: 5.'),
  ...imageSettings,
});

export function createGameScreenshotTool(game: EditorGateway, readCapture: CaptureReader): BridgeTool<typeof gameScreenshotInput, Capture> {
  return new BridgeTool(game, {
    name: 'game_screenshot',
    definition: {
      title: 'Game screenshot',
      description:
        'See the running game: a screenshot of its window with the UI, a strip of frames a given number of physics frames apart, or renders of its 3D world from other angles that leave the game camera alone. Returns the image and the path of its file. Pixel positions in a screenshot of the window are the positions that game_input clicks use. Needs a game started with game_run that has a window, with or without the editor.',
      inputSchema: gameScreenshotInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.screenshot',
    responseSchema: captureSchema,
    params: withoutUnusedTolerance,
    timeoutMs: ({ frames, every_physics_frames }) =>
      screenshotAllowanceMs + (frames === undefined ? 0 : frames * screenshotAllowanceMs + Math.ceil((frames * (every_physics_frames ?? 5) * 1000) / 60)),
    present: (capture, input) => presentCapture(capture, describeGameCapture(capture, input.views === undefined), readCapture),
  });
}

const editorScreenshotInput = z.object({
  views: viewsParameter('the editor camera'),
  animation: z
    .strictObject({
      player: z.string().min(1).describe('Path of the AnimationPlayer relative to the scene root, such as "Hero/AnimationPlayer".'),
      name: z.string().min(1).describe('The animation to pose, such as "walk".'),
      times: z
        .array(z.number().min(0))
        .min(1)
        .max(6)
        .optional()
        .describe('Seconds from the start of the animation to pose the scene at. Default: four times spread over the animation, such as 0, 0.25, 0.5 and 0.75 of a looping one.'),
    })
    .optional()
    .describe(
      'Render the poses of an animation at given times without running the game, one labelled image per time in one picture, from the editor camera or from one given view. Method calls and sounds of the animation stay silent, and the animated values are put back afterwards.',
    ),
  sizes: z
    .array(z.tuple([z.number().int().min(1).max(7680), z.number().int().min(1).max(7680)]))
    .min(1)
    .max(6)
    .optional()
    .describe(
      'For a UI or 2D scene, the window sizes to render it at, such as [[1920, 1080], [1440, 1080]] for 16:9 and 4:3 in one labelled image; the layout follows the stretch mode and aspect of the project. Default: the window size of the project.',
    ),
  ...imageSettings,
});

export function createEditorScreenshotTool(editor: EditorGateway, readCapture: CaptureReader): BridgeTool<typeof editorScreenshotInput, Capture> {
  return new BridgeTool(editor, {
    name: 'editor_screenshot',
    definition: {
      title: 'Editor screenshot',
      description:
        'Render the 3D scene open in the editor from the editor camera or from given views, without the grid and gizmos; the editor camera stays where it is. Check placement and scale from more than one side, such as ["front", "top", "iso"]. With animation, render the poses of an animation at several times, such as the steps of a walk cycle. A UI or 2D scene, such as a HUD or a menu, renders as the game window would show it, at the window size of the project or at given sizes, such as 16:9 and 4:3 side by side. The lighting of 3D scenes is the editor preview, so check the final look with game_screenshot. Needs the editor with a window.',
      inputSchema: editorScreenshotInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'editor.screenshot',
    responseSchema: captureSchema,
    params: withoutUnusedTolerance,
    timeoutMs: screenshotAllowanceMs,
    present: (capture, input) => presentCapture(capture, describeEditorCapture(capture, input.views === undefined), readCapture),
  });
}

export function presentCapture(capture: Capture, summary: string, readCapture: CaptureReader): CallToolResult {
  let image: Buffer;
  try {
    image = readCapture(capture.path);
  } catch (error) {
    return errorResult(`${summary}\nThe screenshot was saved to ${capture.path}, but it could not be read: ${describeError(error)}`);
  }
  const lines = [summary, ...(capture.note === undefined ? [] : [capture.note]), ...(capture.comparison === undefined ? [] : [describeComparison(capture.comparison)]), `Saved to ${capture.path}`];
  return {
    content: [
      { type: 'image', data: image.toString('base64'), mimeType: imageTypes[extname(capture.path).toLowerCase()] ?? 'image/png' },
      { type: 'text', text: lines.join('\n') },
    ],
  };
}

export function describeGameCapture(capture: Capture, showsWindow: boolean): string {
  const game = capture.scene === '' ? 'the running game' : `the running game (${capture.scene})`;
  if (capture.moments !== undefined && capture.moments.length > 0) {
    return `Screenshots of ${game} at ${capture.moments.join('; ')}, in one labelled image, ${describeSize(capture)}.`;
  }
  if (!showsWindow) {
    return describeViews(capture, game);
  }
  const clicks = isScaledDown(capture)
    ? ` Clicks for game_input use the ${String(capture.original_width)}×${String(capture.original_height)} game view.`
    : '';
  return `Screenshot of ${game}, ${describeSize(capture)}.${clicks}`;
}

function describeEditorCapture(capture: Capture, fromEditorCamera: boolean): string {
  const scene = capture.scene === '' ? 'the unsaved scene open in the editor' : capture.scene;
  if (capture.sizes !== undefined && capture.sizes.length > 0) {
    const sheet = capture.sizes.length > 1 ? ', in one labelled image' : '';
    return `Render of ${scene} at ${capture.sizes.join('; ')}, laid out like the game window with the stretch settings of the project${sheet}, ${describeSize(capture)}.`;
  }
  if (capture.moments !== undefined && capture.moments.length > 0) {
    return `Poses of ${scene} from ${capture.views.join(', ')} at ${capture.moments.join('; ')}, in one labelled image, ${describeSize(capture)}. The animated values are back as they were.`;
  }
  return fromEditorCamera ? `Render of ${scene} from the editor camera, without the grid and gizmos, ${describeSize(capture)}.` : describeViews(capture, scene);
}

function describeViews(capture: Capture, subject: string): string {
  const order = capture.views.length === 1 ? '' : ', left to right and top to bottom';
  return `${capture.views.length === 1 ? 'View' : 'Views'} of ${subject}, ${describeSize(capture)}${order}: ${capture.views.join(', ')}.`;
}

function withoutUnusedTolerance(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return input['compare_to'] === undefined ? Object.fromEntries(Object.entries(input).filter(([name]) => name !== 'tolerance')) : { ...input };
}

function describeComparison(comparison: Comparison): string {
  const [earlierWidth = 0, earlierHeight = 0] = comparison.earlier_size;
  const scaled = comparison.sizes_match ? '' : `, scaled from ${String(earlierWidth)}×${String(earlierHeight)}`;
  const mean = `the mean difference is ${String(Number(comparison.mean_difference.toFixed(2)))} of 255`;
  if (comparison.changed_rect === null) {
    return `Compared with ${comparison.earlier}${scaled}: no pixel changed by more than ${String(comparison.tolerance)}, so the pictures match; ${mean}.`;
  }
  const share = `${String(Number((comparison.changed_share * 100).toFixed(1)))}%`;
  return `Compared with ${comparison.earlier}${scaled}: ${share} of the pixels changed by more than ${String(comparison.tolerance)}, all within [${comparison.changed_rect.join(', ')}] (x, y, width, height), outlined in magenta; ${mean}.`;
}

function describeSize(capture: Capture): string {
  const size = `${String(capture.width)}×${String(capture.height)}`;
  return isScaledDown(capture) ? `${size} (scaled down from ${String(capture.original_width)}×${String(capture.original_height)})` : size;
}

function isScaledDown(capture: Capture): boolean {
  return capture.width !== capture.original_width || capture.height !== capture.original_height;
}
