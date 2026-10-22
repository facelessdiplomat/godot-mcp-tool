import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
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
