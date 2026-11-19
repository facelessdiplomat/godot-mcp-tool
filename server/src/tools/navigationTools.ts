import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { formatNamedLayers, namedLayerSchema } from './formatting/propertyReports.js';
import { errorResult, textResult } from './results.js';

const bakedRegionSchema = z.object({
  path: z.string(),
  polygons: z.number().int(),
  vertices: z.number().int(),
  agent_radius: z.number(),
  agent_height: z.number(),
  warnings: z.array(z.string()),
  from: z.string().optional(),
  to: z.string().optional(),
  reason: z.string().optional(),
});

type BakedRegion = z.infer<typeof bakedRegionSchema>;

const navigationBakeSchema = z.object({
  scene: z.string(),
  regions: z.array(bakedRegionSchema),
  skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
});

type NavigationBake = z.infer<typeof navigationBakeSchema>;

const bakeTimeoutMs = 120_000;

const navigationBakeInput = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .describe('Path of the NavigationRegion3D relative to the scene root, such as "Navigation". Default: every NavigationRegion3D of the scene.'),
  scene: z.string().optional().describe('The scene to bake in, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.'),
});

export function createNavigationBakeTool(editor: EditorGateway): BridgeTool<typeof navigationBakeInput, NavigationBake> {
  return new BridgeTool(editor, {
    name: 'navigation_bake',
    definition: {
      title: 'Bake navigation mesh',
      description:
        "Bake the navigation mesh of a NavigationRegion3D, or of every one in the scene, from the geometry under the region — floors and obstacles as meshes, CSG nodes or static collision shapes — as the editor's Bake NavigationMesh button does. One Undo step; the scene stays unsaved until scene_save, and the game uses the saved mesh. The result gives each region's polygon count and the area it covers, which is smaller than the floor by the agent radius; a region that gets no polygons comes with the reason, such as no geometry under it or an agent too large. Agent size and other bake settings are properties of the region's NavigationMesh: agent_radius, agent_height, agent_max_climb, agent_max_slope.",
      inputSchema: navigationBakeInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'navigation.bake',
    responseSchema: navigationBakeSchema,
    timeoutMs: bakeTimeoutMs,
    present: (bake) => describeBake(bake),
  });
}

function describeBake(bake: NavigationBake) {
  const details = [...bake.regions.flatMap(describeRegion), ...describeSkipped(bake.skipped)];
  if (!bake.regions.some((region) => region.polygons > 0)) {
    return errorResult([`No navigation mesh in ${bake.scene} got any polygons.`, ...details].join('\n'));
  }
  const names = bake.regions.map((region) => region.path).join(', ');
  const meshes = bake.regions.length === 1 ? 'mesh' : 'meshes';
  return textResult([`Baked the navigation ${meshes} of ${names} in ${bake.scene} as one Undo step; the scene has unsaved changes.`, ...details].join('\n'));
}

function describeRegion(region: BakedRegion): string[] {
  const summary =
    region.polygons === 0
      ? `- ${region.path}: no polygons: ${region.reason ?? 'the bake produced none'}`
      : `- ${region.path}: ${String(region.polygons)} polygons from ${region.from ?? '?'} to ${region.to ?? '?'}, for an agent of radius ${String(region.agent_radius)} and height ${String(region.agent_height)}`;
  return [summary, ...region.warnings.map((warning) => `  Warning: ${warning}`)];
}

function describeSkipped(skipped: NavigationBake['skipped']): string[] {
  return skipped.length === 0 ? [] : ['Not baked:', ...skipped.map((region) => `- ${region.path}: ${region.reason}`)];
}

const navigationPathSchema = z.object({
  scene: z.string(),
  from: z.string(),
  to: z.string(),
  reached: z.boolean(),
  length: z.number(),
  point_count: z.number().int(),
  points: z.array(z.string()),
  points_left_out: z.number().int().optional(),
  end: z.string().optional(),
  short_by: z.number().optional(),
  start_off_mesh: z.number(),
  target_off_mesh: z.number(),
  navigation_layers: z.array(namedLayerSchema),
  unbaked_regions: z.array(z.string()),
});

type NavigationPath = z.infer<typeof navigationPathSchema>;

const pathPoint = z.tuple([z.number(), z.number(), z.number()]);
const farFromTheMeshMeters = 1;
const pointsShownAtEachEnd = 5;

const navigationGetPathInput = z.object({
  from: pathPoint.describe('Where the path starts, [x, y, z] in world coordinates, such as the position of an enemy.'),
  to: pathPoint.describe('Where the path should end, such as the position of the player.'),
  navigation_layers: z
    .array(z.union([z.number().int().min(1).max(32), z.string().min(1)]))
    .optional()
    .describe('The navigation layers to walk on, by number or by the name the project gives them, as navigation_layers of a NavigationAgent3D. Default: [1], the layer of a new agent.'),
  in_game: z.boolean().default(false).describe('Ask the navigation of the running game instead, as its agents see it now. Needs a game started from the editor.'),
  scene: z
    .string()
    .optional()
    .describe('The scene to ask, as a res:// path or "main"; a scene that is not open is read from disk. Default: the scene currently open in the editor.'),
});

export function createNavigationGetPathTool(editor: EditorGateway): BridgeTool<typeof navigationGetPathInput, NavigationPath> {
  return new BridgeTool(editor, {
    name: 'navigation_get_path',
    definition: {
      title: 'Navigation path',
      description:
        'Ask the navigation for the path from one point to another, as a NavigationAgent3D would get it: whether it reaches the target, its length and its points, and, when it stops short, where and how far from the target. It tells a level whose regions connect from one with a gap without running a chase. Reads the baked navigation meshes of the scene, which navigation_bake makes, or with in_game those of the running game.',
      inputSchema: navigationGetPathInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'navigation.get_path',
    responseSchema: navigationPathSchema,
    present: (path, input) => textResult(describePath(path, input.in_game)),
  });
}

function describePath(path: NavigationPath, inGame: boolean): string {
  const place = inGame ? `the running game${path.scene === '' ? '' : ` (${path.scene})`}` : path.scene;
  const layers = describeNavigationLayers(path.navigation_layers);
  const lines =
    path.point_count === 0
      ? [
          `No path from ${path.from} to ${path.to} in ${place}, ${layers}.`,
          ...describeEndsOffTheMesh(path),
          'Usual causes: no baked region under these points, regions on other navigation layers, or a point far above or beside the floor.',
        ]
      : [
          path.reached
            ? `A path from ${path.from} to ${path.to} in ${place} reaches the target: ${formatMeters(path.length)} over ${String(path.point_count)} points, ${layers}.`
            : `A path from ${path.from} to ${path.to} in ${place} does not reach the target: it stops ${formatMeters(path.short_by ?? 0)} short, at ${path.end ?? ''}, after ${formatMeters(path.length)} over ${String(path.point_count)} points, ${layers}.`,
          ...(path.reached
            ? []
            : ['The navigation mesh around the start does not connect to the one around the target: regions that do not touch or overlap, an obstacle or a gap between them, or a link (NavigationLink3D) that is missing.']),
          ...describeEndsOffTheMesh(path),
          `Points: ${describePoints(path)}`,
        ];
  if (path.unbaked_regions.length > 0) {
    lines.push(`Not baked: ${path.unbaked_regions.join(', ')}. Bake ${path.unbaked_regions.length === 1 ? 'it' : 'them'} with navigation_bake.`);
  }
  return lines.join('\n');
}

function describeNavigationLayers(layers: NavigationPath['navigation_layers']): string {
  if (layers.length === 0) {
    return 'on no navigation layer';
  }
  return `on navigation ${layers.length === 1 ? 'layer' : 'layers'} ${formatNamedLayers(layers)}`;
}

function describeEndsOffTheMesh(path: NavigationPath): string[] {
  const startFar = path.start_off_mesh > farFromTheMeshMeters;
  const targetFar = path.target_off_mesh > farFromTheMeshMeters;
  if (startFar && targetFar) {
    return [`The start lies ${formatMeters(path.start_off_mesh)} from the navigation mesh, and the target ${formatMeters(path.target_off_mesh)}.`];
  }
  if (startFar) {
    return [`The start lies ${formatMeters(path.start_off_mesh)} from the navigation mesh; the path begins at the nearest point of it.`];
  }
  return targetFar ? [`The target lies ${formatMeters(path.target_off_mesh)} from the navigation mesh; the path heads for the nearest point of it.`] : [];
}

function describePoints(path: NavigationPath): string {
  if (path.points_left_out === undefined) {
    return path.points.join(', ');
  }
  return [...path.points.slice(0, pointsShownAtEachEnd), `… ${String(path.points_left_out)} more …`, ...path.points.slice(pointsShownAtEachEnd)].join(', ');
}

function formatMeters(meters: number): string {
  return `${String(Math.round(meters * 10) / 10)} m`;
}
