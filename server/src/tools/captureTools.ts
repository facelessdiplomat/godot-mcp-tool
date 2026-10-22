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
  note: z.string().optional(),
});

export type Capture = z.infer<typeof captureSchema>;

const point = z.array(z.number()).length(3);

const viewTarget = z.string().min(1).optional().describe('A node to frame instead of the whole scene, such as "Player".');

const viewSettings = {
  fov: z.number().min(1).max(179).optional().describe('Vertical field of view in degrees. Default: 50.'),
  label: z.string().min(1).optional().describe('Caption of the view in the image.'),
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
      `Render the 3D scene from these angles instead of ${instead}, up to ${String(maximumViews)} in one labelled image: a preset "front" (from +Z), "back", "left" (from -X), "right", "top" or "iso", framed on the whole scene; {"preset": "front", "target": "Player"} to frame one node; or {"position": [0, 8, 12], "look_at": [0, 0, 0]} for a camera at a point. Each view also takes "fov" and "label".`,
    );
}

const imageSettings = {
  max_size: z.number().int().min(256).max(2560).default(1280).describe('The longest side of the image in pixels. Default: 1280.'),
  format: z.enum(['png', 'jpeg']).default('png').describe('png (default), or jpeg for a smaller file.'),
};

const gameScreenshotInput = z.object({ views: viewsParameter('the game window'), ...imageSettings });

export function createGameScreenshotTool(game: EditorGateway, readCapture: CaptureReader): BridgeTool<typeof gameScreenshotInput, Capture> {
  return new BridgeTool(game, {
    name: 'game_screenshot',
    definition: {
      title: 'Game screenshot',
      description:
        'See the running game: a screenshot of its window with the UI, or renders of its 3D world from other angles that leave the game camera alone. Returns the image and the path of its file. Pixel positions in a screenshot of the window are the positions that game_input clicks use. Needs a game started from the editor with a window.',
      inputSchema: gameScreenshotInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'game.screenshot',
    responseSchema: captureSchema,
    timeoutMs: screenshotAllowanceMs,
    present: (capture, input) => presentCapture(capture, describeGameCapture(capture, input.views === undefined), readCapture),
  });
}

const editorScreenshotInput = z.object({ views: viewsParameter('the editor camera'), ...imageSettings });

export function createEditorScreenshotTool(editor: EditorGateway, readCapture: CaptureReader): BridgeTool<typeof editorScreenshotInput, Capture> {
  return new BridgeTool(editor, {
    name: 'editor_screenshot',
    definition: {
      title: 'Editor screenshot',
      description:
        'Render the 3D scene open in the editor from the editor camera or from given views, without the grid and gizmos; the editor camera stays where it is. Check placement and scale from more than one side, such as ["front", "top", "iso"]. The lighting is the editor preview, so check the final look with game_screenshot. Needs the editor with a window.',
      inputSchema: editorScreenshotInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'editor.screenshot',
    responseSchema: captureSchema,
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
  const lines = [summary, ...(capture.note === undefined ? [] : [capture.note]), `Saved to ${capture.path}`];
  return {
    content: [
      { type: 'image', data: image.toString('base64'), mimeType: imageTypes[extname(capture.path).toLowerCase()] ?? 'image/png' },
      { type: 'text', text: lines.join('\n') },
    ],
  };
}

export function describeGameCapture(capture: Capture, showsWindow: boolean): string {
  const game = capture.scene === '' ? 'the running game' : `the running game (${capture.scene})`;
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
  return fromEditorCamera ? `Render of ${scene} from the editor camera, without the grid and gizmos, ${describeSize(capture)}.` : describeViews(capture, scene);
}

function describeViews(capture: Capture, subject: string): string {
  const order = capture.views.length === 1 ? '' : ', left to right and top to bottom';
  return `${capture.views.length === 1 ? 'View' : 'Views'} of ${subject}, ${describeSize(capture)}${order}: ${capture.views.join(', ')}.`;
}

function describeSize(capture: Capture): string {
  const size = `${String(capture.width)}×${String(capture.height)}`;
  return isScaledDown(capture) ? `${size} (scaled down from ${String(capture.original_width)}×${String(capture.original_height)})` : size;
}

function isScaledDown(capture: Capture): boolean {
  return capture.width !== capture.original_width || capture.height !== capture.original_height;
}
