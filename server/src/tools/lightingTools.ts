import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { sizeText } from './formatting/fileSize.js';
import { errorResult, textResult } from './results.js';

const bakedVoxelGiSchema = z.object({
  path: z.string(),
  data: z.string(),
  bytes: z.number().int(),
  subdiv: z.number().int(),
  size: z.array(z.number()).length(3),
  geometry: z.boolean(),
  warnings: z.array(z.string()),
});

type BakedVoxelGi = z.infer<typeof bakedVoxelGiSchema>;

const voxelGiBakeSchema = z.object({
  scene: z.string(),
  baked: z.array(bakedVoxelGiSchema),
});

type VoxelGiBake = z.infer<typeof voxelGiBakeSchema>;

const bakeTimeoutMs = 180_000;

const voxelGiBakeInput = z.object({
  path: z.string().min(1).optional().describe('Path of the VoxelGI relative to the scene root, such as "Cave/VoxelGI". Default: every VoxelGI of the scene.'),
  scene: z.string().optional().describe('The scene to bake in, as a res:// path; it is opened in the editor if it is not open yet. Default: the scene currently open in the editor.'),
});

export function createVoxelGiBakeTool(editor: EditorGateway): BridgeTool<typeof voxelGiBakeInput, VoxelGiBake> {
  return new BridgeTool(editor, {
    name: 'voxelgi_bake',
    definition: {
      title: 'Bake VoxelGI',
      description:
        "Bake a VoxelGI, or every one in the scene, as the editor's Bake VoxelGI button does, so that it bounces light: it voxelizes the meshes and CSG shapes with GI mode Static inside its box and saves the data next to the scene as <scene>.<VoxelGI>_data.res, or into the file the VoxelGI already uses. A VoxelGI lights nothing until it is baked, and needs a bake again after the geometry inside changes. The link to the data is one Undo step, and the scene stays unsaved until scene_save. Needs the editor with a window and the Forward+ renderer. A LightmapGI or an OccluderInstance3D has no bake method for tools; the result says which button of the editor bakes it.",
      inputSchema: voxelGiBakeInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'voxelgi.bake',
    responseSchema: voxelGiBakeSchema,
    timeoutMs: bakeTimeoutMs,
    present: (bake) => describeBake(bake),
  });
}

function describeBake(bake: VoxelGiBake) {
  const details = bake.baked.flatMap(describeVoxelGi);
  if (!bake.baked.some((voxelGi) => voxelGi.geometry)) {
    return errorResult([`No VoxelGI of ${bake.scene} found geometry to bake.`, ...details].join('\n'));
  }
  const names = bake.baked.length === 1 ? `the VoxelGI` : `the VoxelGI nodes ${bake.baked.map((voxelGi) => voxelGi.path).join(', ')}`;
  return textResult(
    [
      `Baked ${names} of ${bake.scene} as one Undo step; the scene has unsaved changes, so save it with scene_save to keep the link to the data.`,
      ...details,
      'Bake again after the geometry inside changes. energy and propagation of the data make the bounced light stronger.',
    ].join('\n'),
  );
}

function describeVoxelGi(voxelGi: BakedVoxelGi): string[] {
  const [width = 0, height = 0, depth = 0] = voxelGi.size;
  const summary = `- ${voxelGi.path}: ${String(voxelGi.subdiv)} subdivisions over ${String(width)} × ${String(height)} × ${String(depth)} m, data in ${voxelGi.data} (${sizeText(voxelGi.bytes)})`;
  const nothingFound = voxelGi.geometry ? '' : ', but it found no mesh or CSG shape with GI mode Static inside its box, so it bounces no light: move it over the geometry or make its size cover it';
  return [`${summary}${nothingFound}`, ...voxelGi.warnings.map((warning) => `  Warning: ${warning}`)];
}
